const CACHE_NAME = 'swify-diamond-v6';
const ASSETS = [
    '/',
    '/index.html',
    '/manifest.json',
    '/logo.png',
    '/sounds/notification.wav',
    '/screenshot1.png',
    '/screenshot2.png'
];

const DB_NAME = 'SwifyDatabase';
const DB_VERSION = 2;

function openDB() {
    return new Promise((resolve, reject) => {
        const request = indexedDB.open(DB_NAME, DB_VERSION);
        request.onerror = (e) => reject('IndexedDB error: ' + e.target.errorCode);
        request.onsuccess = (e) => resolve(e.target.result);
    });
}

self.addEventListener('install', (event) => {
    event.waitUntil(
        caches.open(CACHE_NAME).then((cache) => {
            return cache.addAll(ASSETS);
        })
    );
    self.skipWaiting();
});

self.addEventListener('activate', (event) => {
    event.waitUntil(
        caches.keys().then((keys) => {
            return Promise.all(
                keys.filter(key => key !== CACHE_NAME).map(key => caches.delete(key))
            );
        })
    );
    self.clients.claim();
});

// Top-level interval to ensure it restarts whenever the SW wakes up
setInterval(checkRemindersInSW, 5000);

self.addEventListener('fetch', (event) => {
    event.respondWith(
        caches.match(event.request).then((response) => {
            return response || fetch(event.request);
        })
    );
});

async function checkRemindersInSW() {
    // Yesterday's way: SW checks all the time, regardless if app is open
    // This provides a fallback if the foreground timer is throttled
    try {
        const db = await openDB();
        const tx = db.transaction(['tasks', 'reminders'], 'readwrite');
        const taskStore = tx.objectStore('tasks');
        const reminderStore = tx.objectStore('reminders');

        const tasksRequest = taskStore.getAll();
        tasksRequest.onsuccess = async () => {
            const tasks = tasksRequest.result;
            const nowTs = Date.now();
            const milestones = [
                // Before Task
                { id: '30m_before', offset: -30 * 60 * 1000, msg: "Due in 30 minutes!" },
                { id: '15m_before', offset: -15 * 60 * 1000, msg: "Due in 15 minutes!" },
                { id: '10m_before', offset: -10 * 60 * 1000, msg: "Due in 10 minutes!" },

                // Deadline
                { id: 'end', offset: 0, msg: "Time is up! Task is due now." },

                // After Deadline (Overdue)
                { id: '5m_after', offset: 5 * 60 * 1000, msg: "Overdue by 5 minutes!" },
                { id: '15m_after', offset: 15 * 60 * 1000, msg: "Overdue by 15 minutes!" },
                { id: '30m_after', offset: 30 * 60 * 1000, msg: "Overdue by 30 minutes!" },
                { id: '1h_after', offset: 60 * 60 * 1000, msg: "Overdue by 1 hour!" },
                { id: '5h_after', offset: 5 * 60 * 60 * 1000, msg: "Overdue by 5 hours!" },
                { id: '12h_after', offset: 12 * 60 * 60 * 1000, msg: "Overdue by 12 hours!" },
                { id: '24h_after', offset: 24 * 60 * 60 * 1000, msg: "Overdue by 1 day!" }
            ];

            for (const task of tasks) {
                if (task.completed || !task.due_date) continue;

                const due = new Date(task.due_date).getTime();
                const diff = nowTs - due;

                const historyReq = reminderStore.get(task.id);
                historyReq.onsuccess = () => {
                    let historyVal = historyReq.result ? historyReq.result.history : {};
                    let latestTriggered = null;

                    // 1. Discrete Milestones
                    milestones.forEach(m => {
                        // Smart Skip: If less than 5 mins remain (or overdue), skip 10m+ pre-warnings
                        if (diff > -5 * 60 * 1000 && m.offset <= -10 * 60 * 1000) return;

                        if (diff >= m.offset && !historyVal[m.id]) {
                            latestTriggered = m;
                        }
                    });

                    // 2. Recurring Daily (After 24h)
                    // "after per day ones"
                    const oneDay = 24 * 60 * 60 * 1000;
                    const lastNotified = historyVal.last_notified || 0;
                    if (diff > oneDay && (nowTs - lastNotified) >= oneDay) {
                        latestTriggered = { id: 'recurring_daily', msg: "Still Overdue! Please complete this task." };
                    }

                    // Check if snoozed
                    if (historyVal.snooze_until && nowTs < historyVal.snooze_until) {
                        return; // Skip if snoozed
                    }

                    if (latestTriggered) {
                        showNotification(task.title, latestTriggered.msg, task.id);
                        milestones.forEach(m => {
                            if (diff >= m.offset) historyVal[m.id] = true;
                        });
                        historyVal.last_notified = nowTs;
                        reminderStore.put({ taskId: task.id, history: historyVal });
                    }
                };
            }

            // 3. Update App Badge (Native OS Integration)
            // "Badge reminder" - Count overdue tasks to show on app icon
            const overdueCount = tasks.filter(t => !t.completed && t.due_date && new Date(t.due_date).getTime() < nowTs).length;
            if ('setAppBadge' in navigator) {
                if (overdueCount > 0) {
                    navigator.setAppBadge(overdueCount);
                } else {
                    navigator.clearAppBadge();
                }
            }
        };
    } catch (err) {
        console.error('[SW] Background check failed:', err);
    }
}

function showNotification(title, body, taskId, validationImage = null) {
    const options = {
        body: body,
        icon: '/logo.png',
        badge: '/logo.png',
        tag: `task-${taskId}`,
        renotify: true,
        vibrate: [200, 100, 200],
        requireInteraction: true,
        data: { taskId: taskId }
    };
    self.registration.showNotification(`Swify: ${title}`, options);
}

self.addEventListener('notificationclick', (event) => {
    event.notification.close();
    const action = event.action;
    const taskId = event.notification.data.taskId;

    if (action === 'complete-task') {
        event.waitUntil(
            (async () => {
                const db = await openDB();
                const tx = db.transaction(['tasks'], 'readwrite');
                const store = tx.objectStore('tasks');
                const task = await new Promise((resolve) => {
                    const req = store.get(taskId);
                    req.onsuccess = () => resolve(req.result);
                });
                if (task) {
                    task.completed = true;
                    store.put(task);
                    const clientsList = await clients.matchAll({ type: 'window', includeUncontrolled: true });
                    clientsList.forEach(client => client.postMessage({ type: 'TASK_COMPLETED', taskId }));
                }
            })()
        );
    } else if (action === 'snooze-task') {
        event.waitUntil(
            (async () => {
                const db = await openDB();
                const tx = db.transaction(['reminders'], 'readwrite');
                const store = tx.objectStore('reminders');
                const historyReq = store.get(taskId);
                historyReq.onsuccess = () => {
                    let historyVal = historyReq.result ? historyReq.result.history : {};
                    historyVal.snooze_until = Date.now() + (10 * 60 * 1000); // 10 mins
                    store.put({ taskId: taskId, history: historyVal });
                };
            })()
        );
    } else if (action === 'complete-task') { // Safety duplicator removal - target block was just "if action === 'complete-task'"
        // pass - already handled above
    } else {
        // Default click or 'view-task': Open App
        event.waitUntil(
            clients.matchAll({ type: 'window', includeUncontrolled: true }).then((clientList) => {
                // If a window is already open, focus it.
                for (const client of clientList) {
                    if (client.url.includes('/') && 'focus' in client) {
                        client.postMessage({ type: 'navigate-task', taskId }); // Tell app to open this task
                        return client.focus();
                    }
                }
                // Otherwise open a new window
                if (clients.openWindow) return clients.openWindow('/?taskId=' + taskId);
            })
        );
    }
});
