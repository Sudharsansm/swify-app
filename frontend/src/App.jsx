// Swify Premium Task & Focus Suite - Deployment Update: 2026-01-06
import React, { useState, useEffect, useRef } from 'react';
import * as API from './api';

const COLORS = ['default', 'red', 'orange', 'yellow', 'green', 'teal', 'blue', 'gray'];
const AUDIO_EXTS = ['.mp3', '.wav', '.mpeg', '.m4a', '.ogg'];
const isAudioFile = (filename) => filename && AUDIO_EXTS.some(ext => filename.toLowerCase().endsWith(ext));

function App() {
  const [tasks, setTasks] = useState([]);
  const [counts, setCounts] = useState({ all: 0, Personal: 0, Work: 0, todo: 0 });
  const [filter, setFilter] = useState('');
  const [search, setSearch] = useState('');
  const [viewMode, setViewMode] = useState(localStorage.getItem('viewMode') || 'list');

  // Clock state
  const [now, setNow] = useState(new Date());

  // Global Focus Timer
  const [globalFocusTime, setGlobalFocusTime] = useState(25 * 60);
  const [isGlobalFocusRunning, setIsGlobalFocusRunning] = useState(false);
  const globalFocusInterval = useRef(null);

  // Per-task Focus Timers (Map of taskId -> { time, isRunning, intervalId })
  const [activeTaskTimers, setActiveTaskTimers] = useState({});
  const taskTimerIntervals = useRef({});

  // Form State
  const [isExpanded, setIsExpanded] = useState(false);
  const [showColorPicker, setShowColorPicker] = useState(false);
  const [formData, setFormData] = useState({
    title: '', description: '', category: 'Personal', priority: 'Medium',
    focus_duration: 25, due_date: '', color: 'default', tags: '', attachments: []
  });
  const [selectedFileList, setSelectedFileList] = useState([]);
  const [previewUrls, setPreviewUrls] = useState([]);
  const fileInputRef = useRef(null);
  const formRef = useRef(null);

  useEffect(() => {
    const handleClickOutside = (event) => {
      if (formRef.current && !formRef.current.contains(event.target)) {
        setIsExpanded(false);
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
    };
  }, []);

  // Edit Modal State
  const [editingTask, setEditingTask] = useState(null);
  const [editFormData, setEditFormData] = useState(null);
  const [editSubtasks, setEditSubtasks] = useState([]);
  const [deletedSubtasks, setDeletedSubtasks] = useState([]);
  const [showEditColorPicker, setShowEditColorPicker] = useState(false);
  const [editPreviewUrls, setEditPreviewUrls] = useState([]);
  const [deletedAttachments, setDeletedAttachments] = useState([]);

  // View Modal State
  const [viewingTask, setViewingTask] = useState(null);

  // PWA Install State
  const [deferredPrompt, setDeferredPrompt] = useState(null);
  const [showInstallBanner, setShowInstallBanner] = useState(false);
  const [showInstallClose, setShowInstallClose] = useState(false);

  // Alarm State
  const [alarmMessage, setAlarmMessage] = useState(null);
  const [notifPermission, setNotifPermission] = useState(typeof Notification !== 'undefined' ? Notification.permission : 'default');
  const [toast, setToast] = useState(null); // In-app notification fallback

  // Sync tasksRef for intervals
  useEffect(() => {
    tasksRef.current = tasks;
  }, [tasks]);

  // Toast Component logic
  useEffect(() => {
    if (toast) {
      const timer = setTimeout(() => setToast(null), 5000);
      return () => clearTimeout(timer);
    }
  }, [toast]);

  // Alarm and Notification Sounds
  // Using paths relative to public folder
  const alarmAudio = useRef(null);
  const notificationSound = useRef(null);

  useEffect(() => {
    alarmAudio.current = new Audio('/sounds/notification.wav');
    notificationSound.current = new Audio('/sounds/notification.wav');
    alarmAudio.current.load();
    notificationSound.current.load();

    // Auto-play policy "unlocker"
    const unlockAudio = () => {
      if (alarmAudio.current) {
        alarmAudio.current.play().then(() => alarmAudio.current.pause()).catch(() => { });
      }
      if (notificationSound.current) {
        notificationSound.current.play().then(() => notificationSound.current.pause()).catch(() => { });
      }
      document.removeEventListener('click', unlockAudio);
      document.removeEventListener('touchstart', unlockAudio);
    };
    document.addEventListener('click', unlockAudio);
    document.addEventListener('touchstart', unlockAudio);

    return () => {
      document.removeEventListener('click', unlockAudio);
      document.removeEventListener('touchstart', unlockAudio);
    };
  }, []);

  // Ref to always have the latest tasks for the intervals
  const tasksRef = useRef([]);
  useEffect(() => {
    // We poll the API directly in checkReminders to avoid stale refs and respect filters
  }, []);

  useEffect(() => {
    fetchTasks();
    const clockInterval = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(clockInterval);
  }, [filter, search]);

  // Persistent background reminder loop (Independent of UI filters)
  useEffect(() => {
    const reminderInterval = setInterval(() => checkReminders(), 3000);
    console.log("[Scheduler] Background reminder loop started.");
    return () => clearInterval(reminderInterval);
  }, []);

  // Separate useEffect for PWA and persistent setup (Runs only once)
  useEffect(() => {
    // Register Service Worker
    if ('serviceWorker' in navigator) {
      window.addEventListener('load', () => {
        navigator.serviceWorker.register('/sw.js')
          .then(reg => {
            console.log('SW registered!', reg);
          })
          .catch(err => console.log('SW registration failed:', err));
      });
    }

    // Check if already installed
    const isStandalone = window.matchMedia('(display-mode: standalone)').matches || window.navigator.standalone === true;

    // Show banner after 45 seconds if not installed and not already shown
    const bannerAlreadyShown = localStorage.getItem('swify_install_banner_shown');
    if (!isStandalone && !bannerAlreadyShown) {
      setTimeout(() => {
        // Double check standalone status right before showing
        const nowStandalone = window.matchMedia('(display-mode: standalone)').matches || window.navigator.standalone === true;
        if (!nowStandalone) {
          setShowInstallBanner(true);
          localStorage.setItem('swify_install_banner_shown', 'true');
          // After showing banner, wait another 10 seconds to show X
          setTimeout(() => {
            setShowInstallClose(true);
          }, 10000);
        }
      }, 45000);
    }

    // Handle PWA Install Prompt
    const handleBeforeInstallPrompt = (e) => {
      console.log('beforeinstallprompt event fired');
      e.preventDefault();
      setDeferredPrompt(e);
    };

    window.addEventListener('beforeinstallprompt', handleBeforeInstallPrompt);

    return () => {
      window.removeEventListener('beforeinstallprompt', handleBeforeInstallPrompt);
    };
  }, []);


  // Automatic permission request on mount (Matches "Yesterday" behavior)
  useEffect(() => {
    // Audio Unlocker: Mobile browsers require user interaction to play sound
    const unlockAudio = () => {
      if (notificationSound.current) {
        notificationSound.current.play().then(() => {
          notificationSound.current.pause();
          notificationSound.current.currentTime = 0;
        }).catch(e => console.log("Audio unlock attempted"));
      }
      // Remove listener once unlocked
      window.removeEventListener('click', unlockAudio);
      window.removeEventListener('touchstart', unlockAudio);
    };

    window.addEventListener('click', unlockAudio);
    window.addEventListener('touchstart', unlockAudio);

    // Specifically check if permission is default (msg not yet seen)
    if ("Notification" in window) {
      if (Notification.permission === 'default') {
        Notification.requestPermission().then(permission => {
          setNotifPermission(permission);
          if (permission === 'granted') {
            sendNotification({ title: 'Notifications Enabled!', id: 'test' }, 'You will now receive task reminders.');
          }
        });
      } else {
        // Just sync state
        setNotifPermission(Notification.permission);
      }
    }
  }, []);

  const fetchTasks = async () => {
    try {
      const res = await API.getTasks(filter || 'all', search);
      const newTasks = res.data.tasks;
      setTasks(newTasks);
      setCounts(res.data.counts);

    } catch (err) {
      console.error(err);
    }
  };

  const handleInstallClick = async () => {
    if (!deferredPrompt) {
      alert("To install Swify:\n\n1. Open your browser menu (usually three dots or a square-with-arrow icon).\n2. Look for 'Add to Home Screen' or 'Install App'.\n3. Follow the prompts to finish!");
      setShowInstallBanner(false);
      return;
    }
    deferredPrompt.prompt();
    const { outcome } = await deferredPrompt.userChoice;
    if (outcome === 'accepted') {
      console.log('User accepted the install prompt');
    } else {
      console.log('User dismissed the install prompt');
    }
    setDeferredPrompt(null);
    setShowInstallBanner(false);
  };

  // --- Clock & Global Focus ---
  const toggleGlobalFocus = () => {
    if (isGlobalFocusRunning) {
      clearInterval(globalFocusInterval.current);
      setIsGlobalFocusRunning(false);
    } else {
      setIsGlobalFocusRunning(true);
      globalFocusInterval.current = setInterval(() => {
        setGlobalFocusTime(prev => {
          if (prev <= 0) {
            clearInterval(globalFocusInterval.current);
            setIsGlobalFocusRunning(false);
            triggerAlarm("Focus Session Complete!");
            return 25 * 60;
          }
          return prev - 1;
        });
      }, 1000);
    }
  };

  const formatTime = (seconds) => {
    const m = Math.floor(seconds / 60).toString().padStart(2, '0');
    const s = (seconds % 60).toString().padStart(2, '0');
    return `${m}:${s}`;
  };

  // --- Alarm Logic ---
  const triggerAlarm = (msg, notifTitle = '⏰ Timer Finished!', notifId = 'focus-complete') => {
    setAlarmMessage(msg);

    // 1. Play Loop (In-App)
    if (alarmAudio.current) {
      alarmAudio.current.loop = true;
      alarmAudio.current.play().catch(e => console.log(e));
    }

    // 2. Send System Notification (Push to Lock Screen)
    if (typeof Notification !== 'undefined' && Notification.permission === 'granted') {
      sendNotification({ title: notifTitle, id: notifId }, msg);
    }
  };

  const stopAlarm = () => {
    setAlarmMessage(null);
    if (alarmAudio.current) {
      alarmAudio.current.pause();
      alarmAudio.current.currentTime = 0;
    }
  };

  // --- Task Focus Logic ---
  const toggleTaskFocusPanel = (taskId, defaultDuration) => {
    setActiveTaskTimers(prev => ({
      ...prev,
      [taskId]: prev[taskId] ? { ...prev[taskId], isOpen: !prev[taskId].isOpen } : { isOpen: true, time: defaultDuration * 60, isRunning: false }
    }));
  };

  const updateTaskTimerDuration = (taskId, minutes) => {
    const newTime = parseInt(minutes) * 60;
    if (!isNaN(newTime) && newTime > 0) {
      setActiveTaskTimers(prev => ({
        ...prev,
        [taskId]: { ...prev[taskId], time: newTime }
      }));
    }
  };

  const startTaskTimer = (taskId) => {
    const current = activeTaskTimers[taskId];
    if (current?.isRunning) return;

    const interval = setInterval(() => {
      setActiveTaskTimers(prev => {
        const taskState = prev[taskId];
        if (!taskState) return prev;

        if (taskState.time <= 0) {
          clearInterval(taskTimerIntervals.current[taskId]);
          delete taskTimerIntervals.current[taskId];
          triggerAlarm("Task Timer Complete!");
          return {
            ...prev,
            [taskId]: { ...taskState, isRunning: false, time: 0 }
          };
        }
        return {
          ...prev,
          [taskId]: { ...taskState, time: taskState.time - 1 }
        };
      });
    }, 1000);

    taskTimerIntervals.current[taskId] = interval;
    setActiveTaskTimers(prev => ({ ...prev, [taskId]: { ...prev[taskId], isRunning: true } }));
  };

  const pauseTaskTimer = (taskId) => {
    if (taskTimerIntervals.current[taskId]) {
      clearInterval(taskTimerIntervals.current[taskId]);
      delete taskTimerIntervals.current[taskId];
    }
    setActiveTaskTimers(prev => ({ ...prev, [taskId]: { ...prev[taskId], isRunning: false } }));
  };

  const stopTaskTimer = (taskId, defaultDuration) => {
    pauseTaskTimer(taskId);
    setActiveTaskTimers(prev => ({ ...prev, [taskId]: { ...prev[taskId], time: defaultDuration * 60 } }));
  };

  // --- Speech Recognition ---
  const startListening = () => {
    if ('webkitSpeechRecognition' in window) {
      const recognition = new window.webkitSpeechRecognition();
      recognition.continuous = false;
      recognition.interimResults = false;
      recognition.lang = 'en-US';
      recognition.start();

      recognition.onresult = (event) => {
        const transcript = event.results[0][0].transcript;
        setFormData(prev => ({ ...prev, description: (prev.description + ' ' + transcript).trim() }));
      };

      recognition.onerror = (e) => console.error("Speech recognition error", e);
    } else {
      alert("Speech recognition is not supported in this browser.");
    }
  };


  // --- Advanced Reminders ---
  const checkReminders = async () => {
    const nowTs = new Date().getTime();

    // FETCH ALL TASKS directly from DB to ignore UI filters
    let allTasks = [];
    try {
      const res = await API.getTasks('all', '');
      allTasks = res.data.tasks;
    } catch (err) {
      console.error("Failed to fetch tasks for reminders", err);
      return;
    }

    const milestones = [
      { id: '30m_before', offset: -30 * 60 * 1000, msg: "Due in 30 minutes!" },
      { id: '15m_before', offset: -15 * 60 * 1000, msg: "Due in 15 minutes!" },
      { id: '10m_before', offset: -10 * 60 * 1000, msg: "Due in 10 minutes!" },
      { id: 'end', offset: 0, msg: "Time is up! Task is due now." },
      { id: '5m_after', offset: 5 * 60 * 1000, msg: "Overdue by 5 minutes!" },
      { id: '15m_after', offset: 15 * 60 * 1000, msg: "Overdue by 15 minutes!" },
      { id: '30m_after', offset: 30 * 60 * 1000, msg: "Overdue by 30 minutes!" },
      { id: '1h_after', offset: 60 * 60 * 1000, msg: "Overdue by 1 hour!" },
      { id: '5h_after', offset: 5 * 60 * 60 * 1000, msg: "Overdue by 5 hours!" },
      { id: '12h_after', offset: 12 * 60 * 60 * 1000, msg: "Overdue by 12 hours!" },
      { id: '24h_after', offset: 24 * 60 * 60 * 1000, msg: "Overdue by 1 day!" }
    ];

    for (const task of allTasks) {
      if (task.completed || !task.due_date) continue;
      const due = new Date(task.due_date).getTime();
      const diff = nowTs - due;

      try {
        const history = await API.getReminderHistory(task.id);

        // Respect Snooze (if snoozed in background)
        if (history.snooze_until && nowTs < history.snooze_until) continue;

        let latestFgMilestone = null;

        // 1. Check discrete milestones
        milestones.forEach(m => {
          // Smart Skip: If less than 5 mins remain (or overdue), skip 10m+ pre-warnings
          if (diff > -5 * 60 * 1000 && m.offset <= -10 * 60 * 1000) return;

          if (diff >= m.offset) {
            // Check if this specific App session has notified this milestone yet.
            if (!history[m.id + '_fg']) {
              latestFgMilestone = m;
            }
          }
        });

        // 2. Refresh Daily if WAY Overdue (> 24h)
        const oneDay = 24 * 60 * 60 * 1000;
        const lastNotifiedFg = history.last_notified_fg || 0;
        if (diff > oneDay && (nowTs - lastNotifiedFg) >= oneDay) {
          latestFgMilestone = { id: 'recurring_daily', msg: "Still Overdue! Please complete this task." };
        }

        if (latestFgMilestone) {
          console.log(`[Foreground Engine] Triggering milestone: ${latestFgMilestone.id} for task ${task.id}`);
          sendNotification(task, latestFgMilestone.msg);

          // Mark this milestone as 'seen' by the App
          milestones.forEach(m => {
            if (diff >= m.offset) history[m.id + '_fg'] = true;
          });

          history.last_notified_fg = nowTs;
          await API.setReminderHistory(task.id, history);
        }
      } catch (error) {
        console.error(`Error checking reminder history for task ${task.id}:`, error);
      }
    }
  };

  const sendNotification = (task, message) => {
    const title = `Swify: ${task.title}`;

    // 1. In-App Visual Toast
    setToast({ title: task.title, message });

    // 2. Resilient Sound Play (Using Clone to ensure it triggers)
    if (notificationSound.current) {
      try {
        const audioClone = notificationSound.current.cloneNode();
        audioClone.volume = 1.0;
        audioClone.play().catch(e => console.warn("Sound blocked. Tap screen.", e));
      } catch (err) {
        console.error("Clone audio logic failed", err);
      }
    }

    // 3. System Push Notification
    if (typeof Notification !== 'undefined' && Notification.permission === "granted") {
      const options = {
        body: message,
        icon: "/logo.png",
        badge: "/logo.png",
        tag: `task-${task.id}`,
        renotify: true,
        vibrate: [200, 100, 200],
        requireInteraction: true,
        data: { taskId: task.id }
      };

      try {
        if ('serviceWorker' in navigator && navigator.serviceWorker.controller) {
          navigator.serviceWorker.ready.then(registration => {
            registration.showNotification(title, options).catch(() => {
              new Notification(title, options);
            });
          });
        } else {
          new Notification(title, options);
        }
      } catch (err) {
        console.error("Native push failed:", err);
      }
    } else if (typeof Notification !== 'undefined' && Notification.permission === 'default') {
      Notification.requestPermission();
    }
  };

  const requestNotificationPermission = () => {
    if (typeof Notification === 'undefined') {
      alert("This browser does not support notifications.");
      return;
    }
    Notification.requestPermission().then(permission => {
      setNotifPermission(permission);
      if (permission === 'granted') {
        const audio = new Audio('/sounds/notification.wav'); // Force new audio instance for test
        audio.play().catch(e => alert("Sound failed to play. Please tap anywhere on the page to unlock audio."));
        sendNotification({ title: 'Notifications Enabled!', id: 'test' }, 'You will now receive task reminders with sound.');
      } else if (permission === 'denied') {
        alert("⚠️ Notifications are BLOCKED.\n\nPlease click the 'Lock' icon in your browser URL bar and set Notifications to 'Allow'.");
      }
    });
  };

  // --- Form Handlers ---
  const handleInputChange = (e) => {
    const { name, value } = e.target;
    setFormData(prev => ({ ...prev, [name]: value }));
  };

  const handleFileChange = (e) => {
    const files = Array.from(e.target.files);
    if (files.length > 0) {
      setFormData(prev => ({ ...prev, attachments: [...prev.attachments, ...files] }));

      const newPreviews = files.map(file => ({
        url: URL.createObjectURL(file),
        name: file.name,
        type: file.type
      }));
      setPreviewUrls(prev => [...prev, ...newPreviews]);
    }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    const data = new FormData();
    Object.keys(formData).forEach(key => {
      if (key === 'attachments') {
        formData[key].forEach(file => data.append('attachment', file));
      } else {
        data.append(key, formData[key]);
      }
    });

    await API.addTask(data);

    // Cleanup previews
    previewUrls.forEach(p => URL.revokeObjectURL(p.url));
    setPreviewUrls([]);

    setFormData({
      title: '', description: '', category: 'Personal', priority: 'Medium',
      focus_duration: 25, due_date: '', color: 'default', tags: '', attachments: []
    });
    if (fileInputRef.current) fileInputRef.current.value = '';
    setIsExpanded(false);
    setShowColorPicker(false);
    fetchTasks();
  };

  // --- Edit Modal Handlers ---
  const openEditModal = (task, e) => {
    e.stopPropagation();
    setEditingTask(task);
    setEditFormData({
      title: task.title,
      description: task.description || '',
      category: task.category,
      priority: task.priority,
      focus_duration: task.focus_duration,
      due_date: task.due_date || '',
      color: task.color,
      tags: task.tags || '',
      attachments: [] // For new uploads
    });
    setEditSubtasks(task.subtasks || []);
    setDeletedSubtasks([]);
    setDeletedAttachments([]);

    // Existing attachments preview
    const existingPreviews = (task.attachments || []).map(a => ({
      id: a.id,
      url: a.file_path, // Already a Blob URL or local path
      name: a.file_name || a.file_path.split('/').pop(),
      isExisting: true
    }));
    setEditPreviewUrls(existingPreviews);
    setShowEditColorPicker(false);
  };

  const handleEditChange = (e) => {
    const { name, value } = e.target;
    setEditFormData(prev => ({ ...prev, [name]: value }));
  };

  const handleEditFileChange = (e) => {
    const files = Array.from(e.target.files);
    if (files.length > 0) {
      setEditFormData(prev => ({ ...prev, attachments: [...prev.attachments, ...files] }));

      const newPreviews = files.map(file => ({
        url: URL.createObjectURL(file),
        name: file.name,
        type: file.type,
        isExisting: false
      }));
      setEditPreviewUrls(prev => [...prev, ...newPreviews]);
    }
  };

  const saveEdit = async (e) => {
    e.preventDefault();
    const data = new FormData();
    Object.keys(editFormData).forEach(key => {
      if (key === 'attachments') {
        editFormData[key].forEach(file => data.append('attachment', file));
      } else if (editFormData[key] !== null) {
        data.append(key, editFormData[key]);
      }
    });

    if (deletedSubtasks.length > 0) {
      data.append('deleted_subtasks', deletedSubtasks.join(','));
    }

    if (deletedAttachments.length > 0) {
      data.append('deleted_attachments', deletedAttachments.join(','));
    }

    editSubtasks.forEach(sub => {
      data.append(`subtask_content_${sub.id}`, sub.text);
    });

    await API.updateTask(editingTask.id, data);

    // Cleanup previews
    editPreviewUrls.forEach(p => {
      if (!p.isExisting) URL.revokeObjectURL(p.url);
    });
    setEditPreviewUrls([]);

    setEditingTask(null);
    fetchTasks();
  };

  const deleteSubtask = (subId) => {
    setEditSubtasks(prev => prev.filter(s => s.id !== subId));
    setDeletedSubtasks(prev => [...prev, subId]);
  };

  const updateSubtaskText = (subId, text) => {
    setEditSubtasks(prev => prev.map(s => s.id === subId ? { ...s, text } : s));
  };


  // --- Helper Icons (SVGs from original) ---
  const Icons = {
    List: <svg className="list-icon" width="20" height="20" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M4 6h16M4 12h16M4 18h16" /></svg>,
    Grid: <svg className="grid-icon" width="20" height="20" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M4 6a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2H6a2 2 0 01-2-2V6zM14 6a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2h-2a2 2 0 01-2-2v-2zM14 16a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2H6a2 2 0 01-2-2v-2zM14 16a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2h-2a2 2 0 01-2-2v-2z" /></svg>,
    Search: <svg className="search-icon" width="20" height="20" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" /></svg>,
    Color: <svg width="18" height="18" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M7 21a4 4 0 01-4-4V5a2 2 0 012-2h4a2 2 0 012 2v12a4 4 0 01-4 4zm0 0h12a2 2 0 002-2v-4a2 2 0 00-2-2h-2.343M11 7.343l1.657-1.657a2 2 0 012.828 0l2.829 2.829a2 2 0 010 2.828l-8.486 8.485M7 17h.01" /></svg>,
    Image: <svg width="18" height="18" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" /></svg>,
    Video: <svg width="18" height="18" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M15 10l4.553-2.276A1 1 0 0121 8.618v6.764a1 1 0 01-1.447.894L15 14M5 18h8a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v8a2 2 0 002 2z" /></svg>,
    Audio: <svg width="18" height="18" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 19V6l12-3v13M9 19c0 1.105-1.343 2-3 2s-3-.895-3-2 1.343-2 3-2 3 .895 3 2zm12-3c0 1.105-1.343 2-3 2s-3-.895-3-2 1.343-2 3-2 3 .895 3 2zM9 10l12-3" /></svg>,
    Voice: <svg width="18" height="18" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 11a7 7 0 01-7 7m0 0a7 7 0 01-7-7m7 7v4m0 0H8m4 0h4m-4-8a3 3 0 01-3-3V5a3 3 0 116 0v6a3 3 0 01-3 3z" /></svg>,
    PinFilled: <svg width="14" height="14" fill="currentColor" viewBox="0 0 24 24"><path d="M16 12V4H17V2H7V4H8V12L5 15V17H11V22H13V17H19V15L16 12Z" /></svg>,
    PinOutline: <svg width="18" height="18" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M5 5a2 2 0 012-2h10a2 2 0 012 2v16l-7-3.5L5 21V5z" /></svg>,
    PinSolid: <svg width="18" height="18" fill="currentColor" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M5 5a2 2 0 012-2h10a2 2 0 012 2v16l-7-3.5L5 21V5z" /></svg>,
    Edit: <svg width="18" height="18" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" /></svg>,
    Delete: <svg width="20" height="20" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" /></svg>,
    Focus: <svg width="16" height="16" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>,
    Play: <svg width="14" height="14" fill="currentColor" viewBox="0 0 24 24"><path d="M8 5v14l11-7z" /></svg>,
    Pause: <svg width="14" height="14" fill="currentColor" viewBox="0 0 24 24"><path d="M6 19h4V5H6v14zm8-14v14h4V5h-4z" /></svg>,
    Stop: <svg width="14" height="14" fill="currentColor" viewBox="0 0 24 24"><path d="M6 6h12v12H6z" /></svg>,
    Time: <svg width="12" height="12" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>,
    Close: <svg width="24" height="24" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M6 18L18 6M6 6l12 12" /></svg>,
    Install: <svg width="20" height="20" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" /></svg>
  };

  /* Helper to Render Attachments (Image, Video, Audio) */
  const renderAttachment = (src, styleOverride = {}) => {
    if (!src) return null;
    const isBlob = src.startsWith('blob:');
    const ext = isBlob ? '' : src.split('.').pop().toLowerCase();

    // Check type if possible, otherwise fallback to extension
    if (src.includes('image') || ['jpg', 'jpeg', 'png', 'gif', 'webp'].includes(ext) || isBlob) {
      // Note: for Blobs we trust the caller or just try to render as image if it's in the image slot
      return <img src={src} alt="Attachment" style={{ width: '100%', borderRadius: '0.5rem', marginBottom: '0.5rem', objectFit: 'cover', ...styleOverride }} onClick={(e) => { window.open(src, '_blank'); e.stopPropagation(); }} />;
    }
    if (src.includes('video') || ['mp4', 'webm', 'ogg', 'mov'].includes(ext)) {
      return <video controls src={src} style={{ width: '100%', borderRadius: '0.5rem', marginBottom: '0.5rem' }} onClick={(e) => e.stopPropagation()} />;
    }
    if (src.includes('audio') || ['mp3', 'wav', 'mpeg', 'm4a'].includes(ext)) {
      return <audio controls src={src} style={{ width: '100%', marginTop: '0.5rem', marginBottom: '0.5rem' }} onClick={(e) => e.stopPropagation()} />;
    }
    return <a href={src} target="_blank" rel="noreferrer" style={{ color: '#818cf8', display: 'block', marginBottom: '0.5rem' }} onClick={(e) => e.stopPropagation()}>View Attachment</a>;
  };

  return (
    <div className="dashboard-container">
      {/* PWA Install Banner */}
      {showInstallBanner && (
        <div className="install-banner-overlay" style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, background: 'rgba(0,0,0,0.7)', zIndex: 4000, display: 'flex', justifyContent: 'center', alignItems: 'center', backdropFilter: 'blur(5px)' }}>
          <div style={{ background: '#1e1b4b', color: 'white', padding: '3rem', borderRadius: '1.5rem', boxShadow: '0 10px 40px rgba(0,0,0,0.5)', maxWidth: '450px', width: '90%', position: 'relative', display: 'flex', flexDirection: 'column', alignItems: 'center', textAlign: 'center', gap: '1.5rem', border: '1px solid var(--glass-border)', animation: 'fadeInDown 0.5s ease' }}>
            {showInstallClose && (
              <button onClick={() => { setShowInstallBanner(false); localStorage.setItem('swify_install_banner_shown', 'true'); }} style={{ position: 'absolute', top: '15px', right: '15px', background: 'transparent', border: 'none', color: 'rgba(255,255,255,0.5)', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                {Icons.Close}
              </button>
            )}
            <div style={{ background: '#000', width: '100px', height: '100px', borderRadius: '1.5rem', display: 'flex', alignItems: 'center', justifyContent: 'center', boxShadow: '0 0 20px rgba(99, 102, 241, 0.4)', overflow: 'hidden' }}>
              <img src="/logo.png" alt="Logo" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
            </div>
            <div>
              <h2 style={{ fontSize: '1.8rem', marginBottom: '0.5rem' }}>Install Swify</h2>
              <p style={{ color: 'var(--text-secondary)', fontSize: '1rem' }}>Get the full premium experience! Install Swify to your home screen for faster access and background notifications.</p>
            </div>
            <button onClick={handleInstallClick} style={{ background: 'var(--primary-color)', color: 'white', border: 'none', padding: '1rem 2rem', borderRadius: '0.8rem', fontWeight: 'bold', cursor: 'pointer', width: '100%', fontSize: '1.1rem', transition: 'all 0.2s ease', boxShadow: '0 4px 10px rgba(99,102,241,0.3)' }} onMouseOver={(e) => e.target.style.transform = 'scale(1.02)'} onMouseOut={(e) => e.target.style.transform = 'scale(1)'}>
              Install Now
            </button>
          </div>
        </div>
      )}

      {/* Sidebar */}
      <aside className="sidebar">
        <div className="brand" style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
          <img src="/logo.png" alt="Swify Logo" style={{ width: '40px', height: '40px', borderRadius: '8px', objectFit: 'cover' }} />
          <h1>Swify</h1>
        </div>

        <nav className="calendar-nav">
          {['all', 'Personal', 'Work', 'TO-DO'].map(cat => (
            <div key={cat}
              className={`nav-item ${filter === (cat === 'all' ? '' : cat) ? 'active' : ''}`}
              onClick={() => setFilter(cat === 'all' ? '' : cat)}>
              <span>{cat === 'all' ? 'All Notes' : cat}</span>
              <span className="badge">{counts[cat] !== undefined ? counts[cat] : (cat === 'TO-DO' ? counts['todo'] : 0)}</span>
            </div>
          ))}
        </nav>

        <div className="world-clock">
          <div className="clock-time" id="clock">{now.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</div>
          <div className="clock-date" id="date">{now.toLocaleDateString([], { weekday: 'short', month: 'short', day: 'numeric' })}</div>
        </div>

        <div className="focus-timer">
          <h3>Focus Timer</h3>
          <div className="clock-time" id="focus-display" style={{ fontSize: '2rem' }}>
            {formatTime(globalFocusTime)}
          </div>
          <button className="focus-btn" onClick={toggleGlobalFocus}>
            {isGlobalFocusRunning ? 'Stop Focus' : 'Start Focus'}
          </button>
        </div>

        <div style={{ marginTop: 'auto', padding: '1rem', borderTop: '1px solid var(--glass-border)', display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
          {notifPermission !== 'granted' && (
            <button className="add-btn" style={{ width: '100%', background: '#fbbf24', color: '#000', fontSize: '0.85rem' }} onClick={requestNotificationPermission}>
              🔔 Enable Notifications
            </button>
          )}
        </div>

      </aside>

      {/* Main Content */}
      <main className="main-content">
        <header style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 0 }}>
          <div>
            <h2 style={{ fontSize: '1.5rem' }}>{filter || 'My Notes'}</h2>
            <p>Capture ideas, lists, and more.</p>
          </div>
          {/* View Toggle */}
          <button className="view-toggle" onClick={() => {
            const mode = viewMode === 'list' ? 'grid' : 'list';
            setViewMode(mode);
            localStorage.setItem('viewMode', mode);
          }}>
            {viewMode === 'list' ? Icons.List : Icons.Grid}
            <span id="viewLabel">{viewMode === 'list' ? 'View' : 'Grid'}</span>
          </button>

          {/* Persistent Install Button (YouTube Style) */}
          {deferredPrompt && (
            <button className="icon-btn" onClick={handleInstallClick} title="Install Swify App" style={{ background: 'var(--primary-color)', color: 'white', border: 'none', padding: '0.6rem 1rem', borderRadius: '0.8rem', fontWeight: 'bold' }}>
              {Icons.Install} Install App
            </button>
          )}
        </header>

        {/* Search Bar */}
        <form className="search-bar" onSubmit={(e) => e.preventDefault()}>
          <input type="text" name="q" className="search-input" placeholder="Search notes..."
            value={search} onChange={(e) => setSearch(e.target.value)} />
          {Icons.Search}
        </form>

        {/* Add Note Form */}
        <form className="input-group" encType="multipart/form-data" id="addForm" onSubmit={handleSubmit} ref={formRef}>
          <input type="hidden" name="color" value={formData.color} />

          <div className="input-wrapper" style={{ flexDirection: 'column', width: '100%', gap: '0' }}>
            <input type="text" name="title" id="noteTitle" placeholder="Title" autoComplete="off"
              style={{ fontWeight: '600', fontSize: '1.1rem', display: isExpanded ? 'block' : 'none', padding: '0', marginBottom: '4px', background: 'transparent', border: 'none', color: 'var(--text-primary)', outline: 'none' }}
              value={formData.title} onChange={handleInputChange} />

            <textarea name="description" id="noteDesc" placeholder="Take a note..." required autoComplete="off"
              onClick={() => setIsExpanded(true)}
              style={{ width: '100%', background: 'transparent', border: 'none', color: 'var(--text-primary)', fontSize: '1rem', outline: 'none', resize: 'none', minHeight: isExpanded ? '120px' : '46px', fontFamily: 'inherit', scrollbarWidth: 'none', padding: '0.5rem 0', marginTop: '0', transition: 'min-height 0.2s ease' }}
              value={formData.description} onChange={handleInputChange}
            ></textarea>

            {/* Expanded Fields */}
            <div id="expandedFields"
              style={{ display: isExpanded ? 'flex' : 'none', flexDirection: 'column', gap: '0.5rem', marginTop: '0.5rem', width: '100%' }}>
              <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
                <select name="category" value={formData.category} onChange={handleInputChange}
                  style={{ background: 'rgba(255,255,255,0.05)', border: '1px solid var(--glass-border)', color: 'var(--text-secondary)', padding: '0.5rem', borderRadius: '0.5rem' }}>
                  <option value="Personal">Personal</option>
                  <option value="Work">Work</option>
                  <option value="TO-DO">TO-DO</option>
                </select>
                <select name="priority" value={formData.priority} onChange={handleInputChange}
                  style={{ background: 'rgba(255,255,255,0.05)', border: '1px solid var(--glass-border)', color: 'var(--text-secondary)', padding: '0.5rem', borderRadius: '0.5rem' }}>
                  <option value="Medium">Medium</option>
                  <option value="High">High</option>
                  <option value="Low">Low</option>
                </select>
                <select name="recurrence" value={formData.recurrence || 'none'} onChange={handleInputChange}
                  style={{ background: 'rgba(255,255,255,0.05)', border: '1px solid var(--glass-border)', color: 'var(--text-secondary)', padding: '0.5rem', borderRadius: '0.5rem' }}>
                  <option value="none">No Repeat</option>
                  <option value="daily">Daily</option>
                  <option value="weekly">Weekly</option>
                  <option value="monthly">Monthly</option>
                </select>
                <input type="number" name="focus_duration" placeholder="Focus (min)" value={formData.focus_duration} min="1" max="180" onChange={handleInputChange}
                  style={{ width: '80px', background: 'rgba(255,255,255,0.05)', border: '1px solid var(--glass-border)', color: 'var(--text-secondary)', padding: '0.5rem', borderRadius: '0.5rem' }} />
                <input type="datetime-local" name="due_date" title="Set Due Date" value={formData.due_date} onChange={handleInputChange} />
                <input type="text" name="tags" placeholder="#Tags" value={formData.tags} onChange={handleInputChange}
                  style={{ background: 'rgba(255,255,255,0.05)', border: '1px solid var(--glass-border)', color: 'var(--text-secondary)', padding: '0.5rem', borderRadius: '0.5rem', flex: 1, minWidth: '100px' }} />
              </div>

              {/* Previews */}
              {previewUrls.length > 0 && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem', marginTop: '0.5rem' }}>
                  {previewUrls.map((p, idx) => (
                    <div key={idx} style={{ maxHeight: '200px', overflow: 'hidden', borderRadius: '0.5rem', position: 'relative', display: 'flex', justifyContent: 'center', background: 'rgba(0,0,0,0.2)' }}>
                      {p.type?.startsWith('image/') && <img src={p.url} style={{ maxHeight: '200px', maxWidth: '100%' }} alt="Preview" />}
                      {p.type?.startsWith('video/') && <video src={p.url} controls style={{ maxHeight: '200px', maxWidth: '100%' }} />}
                      {p.type?.startsWith('audio/') && <audio src={p.url} controls style={{ width: '100%' }} />}
                      <button type="button" onClick={() => {
                        URL.revokeObjectURL(p.url);
                        setPreviewUrls(prev => prev.filter((_, i) => i !== idx));
                        setFormData(prev => ({ ...prev, attachments: prev.attachments.filter((_, i) => i !== idx) }));
                      }}
                        style={{ position: 'absolute', top: 5, right: 5, background: 'rgba(0,0,0,0.6)', border: 'none', color: '#fff', borderRadius: '50%', width: 20, height: 20, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>&times;</button>
                    </div>
                  ))}
                </div>
              )}

              {/* Toolbar */}
              <div className="toolbar-actions" style={{ justifyContent: 'space-between' }}>
                <div style={{ display: 'flex', gap: '0.5rem', position: 'relative' }}>
                  {/* Color Picker */}
                  <div style={{ position: 'relative' }}>
                    <button type="button" className="icon-btn" title="Change Color" onClick={() => setShowColorPicker(!showColorPicker)}>
                      {Icons.Color}
                    </button>
                    {showColorPicker && (
                      <div className="color-picker-popover" style={{ display: 'flex', position: 'absolute', bottom: '100%', left: 0, background: '#1e1b4b', padding: '0.5rem', gap: '0.5rem', borderRadius: '0.5rem', border: '1px solid var(--glass-border)', zIndex: 10 }}>
                        {COLORS.map(c => (
                          <div key={c} className="color-option"
                            onClick={() => { setFormData({ ...formData, color: c }); setShowColorPicker(false); }}
                            style={{ width: '20px', height: '20px', borderRadius: '50%', cursor: 'pointer', border: '1px solid rgba(255,255,255,0.2)', backgroundColor: c === 'default' ? '#333' : c === 'red' ? '#ef4444' : c === 'orange' ? '#f97316' : c === 'yellow' ? '#eab308' : c === 'green' ? '#22c55e' : c === 'teal' ? '#14b8a6' : c === 'blue' ? '#3b82f6' : '#64748b' }}
                          ></div>
                        ))}
                      </div>
                    )}
                  </div>
                  {/* Media Icons */}
                  <button type="button" className="icon-btn" onClick={() => fileInputRef.current.click()} title="Add Image">
                    {Icons.Image}
                  </button>
                  <button type="button" className="icon-btn" onClick={() => fileInputRef.current.click()} title="Add Video">
                    {Icons.Video}
                  </button>
                  <button type="button" className="icon-btn" onClick={() => fileInputRef.current.click()} title="Add Audio">
                    {Icons.Audio}
                  </button>

                  <input type="file" name="attachment" ref={fileInputRef} accept="image/*,video/*,audio/*"
                    style={{ display: 'none' }} onChange={handleFileChange} multiple />

                  {/* Voice */}
                  <button type="button" className="icon-btn" title="Voice Note" onClick={startListening}>
                    {Icons.Voice}
                  </button>
                </div>

                <button type="submit" className="add-btn">Add Note</button>
              </div>
            </div>
          </div>
        </form>

        <ul className={`task-list ${viewMode === 'grid' ? 'grid-view' : ''}`} id="taskList">
          {tasks.length > 0 ? (
            tasks.map((task, index) => {
              const taskTimer = activeTaskTimers[task.id] || { time: task.focus_duration * 60, isRunning: false, isOpen: false };

              return (
                <li key={task.id} className={`task-item color-${task.color} ${task.completed ? 'completed' : ''}`}
                  onClick={() => setViewingTask(task)}
                  style={{ animationDelay: `${index * 0.1}s`, flexDirection: 'column', alignItems: 'stretch', position: 'relative', cursor: 'pointer' }}>

                  {task.is_pinned && (
                    <div className="pinned-icon" title="Pinned" onClick={(e) => e.stopPropagation()}>
                      {Icons.PinFilled}
                    </div>
                  )}

                  {(task.attachments || []).map(att => !isAudioFile(att.file_path) && (
                    <div key={att.id} className="task-attachment">
                      {renderAttachment(att.file_path)}
                    </div>
                  ))}

                  <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', width: '100%' }}>
                    {/* Clickable Content Area */}
                    <div className="task-content" onClick={() => setViewingTask(task)} style={{ cursor: 'pointer', flex: 1 }}>
                      <div className="checkbox-wrapper">
                        <input type="checkbox" className="task-checkbox" checked={task.completed}
                          onClick={(e) => {
                            e.stopPropagation();
                            if (task.recurrence && task.recurrence !== 'none' && !task.completed) {
                              // Handle Recurrence: Don't complete, just move date
                              const nextDate = new Date(task.due_date);
                              if (task.recurrence === 'daily') nextDate.setDate(nextDate.getDate() + 1);
                              if (task.recurrence === 'weekly') nextDate.setDate(nextDate.getDate() + 7);
                              if (task.recurrence === 'monthly') nextDate.setMonth(nextDate.getMonth() + 1);

                              // Update task with new date and ensure active
                              const updatedTask = new FormData();
                              updatedTask.append('due_date', nextDate.toISOString());
                              API.updateTask(task.id, updatedTask).then(() => {
                                alert(`🔄 Task Recurring!\n\nMoved to: ${nextDate.toLocaleDateString()}`);
                                fetchTasks();
                              });
                            } else {
                              API.completeTask(task.id).then(fetchTasks);
                            }
                          }} readOnly />
                      </div>
                      <div className="task-meta" style={{ width: '100%' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', flexWrap: 'wrap' }}>
                          <span className="task-text" style={{ fontWeight: '600' }}>{task.title}</span>
                        </div>

                        {task.description && (
                          <span className="task-description">{task.description}</span>
                        )}

                        <div style={{ display: 'flex', gap: '0.5rem', marginTop: '0.5rem', flexWrap: 'wrap' }}>
                          <span className={`priority-badge priority-${task.priority.toLowerCase()}`}>{task.priority}</span>
                          <span className="badge" style={{ fontSize: '0.7rem' }}>{task.category}</span>
                          {task.due_date && (
                            <div className="timer-badge" title="Due Date" style={{
                              background: (!task.completed && new Date(task.due_date) < now) ? 'rgba(239, 68, 68, 0.2)' : 'rgba(255,255,255,0.05)',
                              border: (!task.completed && new Date(task.due_date) < now) ? '1px solid #ef4444' : '1px solid var(--glass-border)'
                            }}>
                              <span style={{ color: (!task.completed && new Date(task.due_date) < now) ? '#ef4444' : 'inherit', display: 'flex', alignItems: 'center', gap: '4px' }}>
                                {Icons.Time}
                                <span className="timer-text">
                                  {new Date(task.due_date).toLocaleString([], { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })}
                                  {!task.completed && new Date(task.due_date) < now && (
                                    <strong style={{ marginLeft: '6px', fontSize: '0.65rem', letterSpacing: '0.5px' }}>[ OVERDUE ]</strong>
                                  )}
                                </span>
                              </span>
                            </div>
                          )}
                          {task.tags && (
                            <span className="badge"
                              style={{ fontSize: '0.7rem', background: 'rgba(255, 255, 255, 0.1)', color: 'var(--text-secondary)' }}>{task.tags}</span>
                          )}
                          {(task.attachments || []).some(att => isAudioFile(att.file_path)) && (
                            <span className="badge" title="Audio Attachment"
                              style={{ fontSize: '0.7rem', background: 'rgba(255, 255, 255, 0.1)', color: 'var(--text-secondary)', display: 'inline-flex', alignItems: 'center', gap: '4px' }}>
                              {Icons.Audio} Audio
                            </span>
                          )}
                          {task.recurrence && task.recurrence !== 'none' && (
                            <span className="badge" title={`Repeats ${task.recurrence}`}
                              style={{ fontSize: '0.7rem', background: 'rgba(59, 130, 246, 0.2)', color: '#60a5fa', display: 'inline-flex', alignItems: 'center', gap: '4px' }}>
                              🔄 {task.recurrence}
                            </span>
                          )}
                        </div>
                      </div>
                    </div>

                    {/* Action Buttons */}
                    <div className="task-actions" style={{ display: 'flex', gap: '0.2rem', alignItems: 'center' }}>
                      <button className="btn-icon"
                        title={task.is_pinned ? 'Unpin' : 'Pin'}
                        onClick={(e) => { e.stopPropagation(); API.togglePin(task.id).then(fetchTasks); }}>
                        {task.is_pinned ? Icons.PinSolid : Icons.PinOutline}
                      </button>
                      <button className="btn-icon"
                        onClick={(e) => openEditModal(task, e)}>
                        {Icons.Edit}
                      </button>
                      <button className="delete-btn" title="Delete Task"
                        onClick={(e) => { e.stopPropagation(); if (confirm('Delete?')) API.deleteTask(task.id).then(fetchTasks); }}>
                        {Icons.Delete}
                      </button>
                    </div>
                  </div>

                  <button className="btn-small btn-focus-toggle"
                    onClick={(e) => { e.stopPropagation(); toggleTaskFocusPanel(task.id, task.focus_duration); }}
                    style={{ marginTop: '0.5rem', width: 'fit-content' }}>
                    {Icons.Focus}
                    Focus Mode
                  </button>

                  {/* Subtasks */}
                  <div className="subtask-list">
                    {task.subtasks.map(sub => (
                      <div key={sub.id} className="subtask-item">
                        <input type="checkbox" className="subtask-checkbox" checked={sub.completed}
                          onClick={(e) => { e.stopPropagation(); API.toggleSubtask(sub.id).then(fetchTasks); }} readOnly />
                        <span style={{ textDecoration: sub.completed ? 'line-through' : 'none' }}>{sub.text}</span>
                      </div>
                    ))}
                    <form className="subtask-form"
                      onClick={(e) => e.stopPropagation()}
                      onSubmit={(e) => {
                        e.preventDefault();
                        const text = e.target.subtask_text.value;
                        if (text) API.addSubtask(task.id, text).then(() => { e.target.reset(); fetchTasks(); });
                      }}>
                      <input type="text" name="subtask_text" className="subtask-input" placeholder="+ List item" />
                    </form>
                  </div>

                  {/* Focus Panel (Per Task) */}
                  {taskTimer.isOpen && (
                    <div className={`focus-row active`}>
                      <input type="number" className="duration-input"
                        value={Math.floor(taskTimer.time / 60)}
                        min="1"
                        onChange={(e) => updateTaskTimerDuration(task.id, e.target.value)}
                        onClick={(e) => e.stopPropagation()} />
                      <span className="timer-display">{formatTime(taskTimer.time)}</span>
                      <div className="focus-controls" onClick={(e) => e.stopPropagation()}>
                        <button className="btn-small btn-play" onClick={() => startTaskTimer(task.id)}>
                          {Icons.Play}
                        </button>
                        <button className="btn-small btn-pause" onClick={() => pauseTaskTimer(task.id)}>
                          {Icons.Pause}
                        </button>
                        <button className="btn-small btn-stop" onClick={() => stopTaskTimer(task.id, task.focus_duration)}>
                          {Icons.Stop}
                        </button>
                      </div>
                    </div>
                  )}
                </li>
              );
            })
          ) : (
            <div className="empty-state">
              <p>No notes found. Swify helps you stay on top of things!</p>
            </div>
          )}
        </ul>
      </main>

      {/* Edit Modal */}
      {editingTask && (
        <div id="editModal" className={`edit-form-overlay active`} onClick={() => setEditingTask(null)}>
          <form id="editForm" className="edit-modal" onClick={(e) => e.stopPropagation()} onSubmit={saveEdit} encType="multipart/form-data">
            <h3>Edit Note</h3>
            <input type="text" name="title" className="search-input" required placeholder="Title" value={editFormData.title} onChange={handleEditChange} />
            <textarea name="description" className="search-input" placeholder="Note"
              style={{ minHeight: '100px', resize: 'vertical' }} value={editFormData.description} onChange={handleEditChange}></textarea>

            <div style={{ display: 'flex', gap: '1rem', flexWrap: 'wrap' }}>
              <select name="category" className="search-input" value={editFormData.category} onChange={handleEditChange}>
                <option value="Personal">Personal</option>
                <option value="Work">Work</option>
                <option value="TO-DO">TO-DO</option>
              </select>
              <select name="priority" className="search-input" value={editFormData.priority} onChange={handleEditChange}>
                <option value="Medium">Medium</option>
                <option value="High">High</option>
                <option value="Low">Low</option>
              </select>
            </div>
            <div style={{ display: 'flex', gap: '1rem' }}>
              <input type="number" name="focus_duration" className="search-input"
                placeholder="Focus (min)" value={editFormData.focus_duration} onChange={handleEditChange} />
              <input type="datetime-local" name="due_date" className="search-input" value={editFormData.due_date} onChange={handleEditChange} />
            </div>
            <input type="text" name="tags" className="search-input" placeholder="#Tags"
              style={{ marginTop: '0.5rem' }} value={editFormData.tags} onChange={handleEditChange} />

            {/* Subtasks Edit Section */}
            <div style={{ marginTop: '1rem' }}>
              <label style={{ fontSize: '0.85rem', color: 'var(--text-secondary)' }}>Subtasks</label>
              <div id="editSubtasks" style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem', marginTop: '0.5rem' }}>
                {editSubtasks.map(sub => (
                  <div key={sub.id} style={{ display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
                    <input type="text" value={sub.text} className="search-input" style={{ flex: 1 }}
                      onChange={(e) => updateSubtaskText(sub.id, e.target.value)} />
                    <button type="button" className="icon-btn" style={{ color: '#ef4444' }}
                      onClick={() => deleteSubtask(sub.id)}>&times;</button>
                  </div>
                ))}
              </div>
            </div>

            {/* Edit Media Previews */}
            {editPreviewUrls.length > 0 && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem', marginTop: '0.5rem' }}>
                {editPreviewUrls.map((p, idx) => (
                  <div key={idx} style={{ maxHeight: '200px', overflow: 'hidden', borderRadius: '0.5rem', position: 'relative', display: 'flex', justifyContent: 'center', background: 'rgba(0,0,0,0.2)' }}>
                    {(p.type?.startsWith('image/') || (!p.type && ['jpg', 'jpeg', 'png', 'gif', 'webp'].some(ext => p.url.toLowerCase().endsWith(ext)))) &&
                      <img src={p.url} style={{ maxHeight: '200px', maxWidth: '100%', objectFit: 'contain' }} alt="Preview" />}

                    {(p.type?.startsWith('video/') || (!p.type && ['mp4', 'webm', 'ogg', 'mov'].some(ext => p.url.toLowerCase().endsWith(ext)))) &&
                      <video src={p.url} controls style={{ maxHeight: '200px', maxWidth: '100%' }} />}

                    {(p.type?.startsWith('audio/') || (!p.type && ['mp3', 'wav', 'mpeg', 'm4a'].some(ext => p.url.toLowerCase().endsWith(ext)))) &&
                      <audio src={p.url} controls style={{ width: '100%' }} />}

                    <button type="button" onClick={() => {
                      if (p.isExisting) {
                        setDeletedAttachments(prev => [...prev, p.id]);
                      } else {
                        URL.revokeObjectURL(p.url);
                        setEditFormData(prev => ({ ...prev, attachments: prev.attachments.filter(f => f.name !== p.name) }));
                      }
                      setEditPreviewUrls(prev => prev.filter((_, i) => i !== idx));
                    }}
                      style={{ position: 'absolute', top: 5, right: 5, background: 'rgba(0,0,0,0.6)', border: 'none', color: '#fff', borderRadius: '50%', width: 20, height: 20, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>&times;</button>
                  </div>
                ))}
              </div>
            )}

            <div style={{ display: 'flex', gap: '0.5rem', marginTop: '1rem' }}>
              <button type="button" className="icon-btn" onClick={() => document.getElementById('editFileInput').click()} title="Add Image">
                {Icons.Image}
              </button>
              <button type="button" className="icon-btn" onClick={() => document.getElementById('editFileInput').click()} title="Add Video">
                {Icons.Video}
              </button>
              <button type="button" className="icon-btn" onClick={() => document.getElementById('editFileInput').click()} title="Add Audio">
                {Icons.Audio}
              </button>

              <input type="file" name="attachment" id="editFileInput" accept="image/*,video/*,audio/*" style={{ display: 'none' }} onChange={handleEditFileChange} multiple />

              {/* Edit Color Picker */}
              <div style={{ position: 'relative' }}>
                <button type="button" className="icon-btn" title="Change Color" onClick={() => setShowEditColorPicker(!showEditColorPicker)}>
                  {Icons.Color}
                </button>
                {showEditColorPicker && (
                  <div className="color-picker-popover" style={{ display: 'flex', flexWrap: 'wrap', position: 'absolute', bottom: '100%', left: 0, background: '#1e1b4b', padding: '0.5rem', gap: '0.5rem', borderRadius: '0.5rem', border: '1px solid var(--glass-border)', zIndex: 10, width: '150px' }}>
                    {COLORS.map(c => (
                      <div key={c} className="color-option"
                        onClick={() => { setEditFormData({ ...editFormData, color: c }); setShowEditColorPicker(false); }}
                        style={{ width: '20px', height: '20px', borderRadius: '50%', cursor: 'pointer', border: '1px solid rgba(255,255,255,0.2)', backgroundColor: c === 'default' ? '#333' : c === 'red' ? '#ef4444' : c === 'orange' ? '#f97316' : c === 'yellow' ? '#eab308' : c === 'green' ? '#22c55e' : c === 'teal' ? '#14b8a6' : c === 'blue' ? '#3b82f6' : '#64748b' }}
                      ></div>
                    ))}
                  </div>
                )}
              </div>
            </div>

            <div style={{ display: 'flex', gap: '1rem', justifyContent: 'flex-end' }}>
              <button type="button" className="btn-small btn-stop" onClick={() => setEditingTask(null)}>Cancel</button>
              <button type="submit" className="add-btn">Save</button>
            </div>
          </form>
        </div>
      )}

      {/* View Modal (Read Only) */}
      {viewingTask && !editingTask && (
        <div id="viewModal" className={`edit-form-overlay active`} onClick={() => setViewingTask(null)}>
          <div className="edit-modal" onClick={(e) => e.stopPropagation()} style={{ position: 'relative' }}>
            <div style={{ position: 'absolute', top: '1rem', right: '1rem', display: 'flex', gap: '0.5rem' }}>
              <button className="icon-btn" title="Edit Note"
                onClick={(e) => {
                  setEditingTask(viewingTask);
                  setEditFormData({
                    title: viewingTask.title,
                    description: viewingTask.description || '',
                    category: viewingTask.category,
                    priority: viewingTask.priority,
                    focus_duration: viewingTask.focus_duration,
                    due_date: viewingTask.due_date || '',
                    color: viewingTask.color,
                    tags: viewingTask.tags || '',
                    attachment: null
                  });
                  setEditSubtasks(viewingTask.subtasks || []);
                  setDeletedSubtasks([]);
                  setEditSelectedFileName('');
                  setShowEditColorPicker(false);
                  setViewingTask(null);
                }}>
                {Icons.Edit}
              </button>
              <button onClick={() => setViewingTask(null)} className="icon-btn" title="Close">
                {Icons.Close}
              </button>
            </div>

            {(viewingTask.attachments || []).map(att => !isAudioFile(att.file_path) && (
              <div key={att.id} style={{ marginBottom: '1rem' }}>
                {renderAttachment(att.file_path, { maxHeight: '300px', display: 'block' })}
              </div>
            ))}

            <h3 style={{ marginBottom: '0.5rem', fontSize: '1.5rem', paddingRight: '4rem' }}>{viewingTask.title}</h3>

            <div style={{ display: 'flex', gap: '0.5rem', marginBottom: '1rem', flexWrap: 'wrap' }}>
              <span className="badge">{viewingTask.category}</span>
              <span className={`priority-badge priority-${viewingTask.priority.toLowerCase()}`}>{viewingTask.priority}</span>
              {viewingTask.due_date && <span className="timer-badge">{new Date(viewingTask.due_date).toLocaleString()}</span>}
            </div>

            <div style={{ whiteSpace: 'pre-wrap', color: 'var(--text-secondary)', marginBottom: '1.5rem', lineHeight: '1.6' }}>
              {viewingTask.description}
            </div>

            {viewingTask.tags && <div className="tags-list" style={{ marginBottom: '1rem' }}>{viewingTask.tags}</div>}

            {(viewingTask.attachments || []).some(att => isAudioFile(att.file_path)) && (
              <div style={{ marginBottom: '1rem', background: 'rgba(0,0,0,0.1)', padding: '1rem', borderRadius: '0.5rem' }}>
                <h4 style={{ marginBottom: '0.5rem', fontSize: '0.9rem', color: 'var(--text-secondary)' }}>Audio Attachments</h4>
                {(viewingTask.attachments || []).filter(att => isAudioFile(att.file_path)).map(att => (
                  <div key={att.id} style={{ marginBottom: '0.5rem' }}>
                    <div style={{ fontSize: '0.8rem', marginBottom: '0.2rem', color: 'var(--text-secondary)' }}>{att.file_path.split('/').pop()}</div>
                    {renderAttachment(att.file_path)}
                  </div>
                ))}
              </div>
            )}

            <div className="subtask-list" style={{ marginBottom: '1rem' }}>
              {viewingTask.subtasks.map(sub => (
                <div key={sub.id} className="subtask-item">
                  <input type="checkbox" className="subtask-checkbox" checked={sub.completed}
                    onChange={() => API.toggleSubtask(sub.id).then(() => {
                      API.getTasks(filter || 'all', search).then(r => {
                        const updated = r.data.tasks.find(t => t.id === viewingTask.id);
                        if (updated) setViewingTask(updated);
                        setTasks(r.data.tasks);
                        setCounts(r.data.counts);
                      });
                    })} />
                  <span style={{ textDecoration: sub.completed ? 'line-through' : 'none' }}>{sub.text}</span>
                </div>
              ))}
              <form className="subtask-form"
                onSubmit={(e) => {
                  e.preventDefault();
                  const text = e.target.subtask_text.value;
                  if (text) API.addSubtask(viewingTask.id, text).then(() => {
                    e.target.reset();
                    API.getTasks(filter || 'all', search).then(r => {
                      const updated = r.data.tasks.find(t => t.id === viewingTask.id);
                      if (updated) setViewingTask(updated);
                      setTasks(r.data.tasks);
                      setCounts(r.data.counts);
                    });
                  });
                }}>
                <input type="text" name="subtask_text" className="subtask-input" placeholder="+ List item" />
              </form>
            </div>

            {/* Focus Section */}
            <div style={{ marginTop: '1rem', borderTop: '1px solid rgba(255,255,255,0.1)', paddingTop: '1rem' }}>
              <button className="btn-small btn-focus-toggle"
                onClick={() => toggleTaskFocusPanel(viewingTask.id, viewingTask.focus_duration)}
                style={{ width: 'fit-content' }}>
                {Icons.Focus}
                Focus Mode
              </button>

              {activeTaskTimers[viewingTask.id]?.isOpen && (
                <div className="focus-row active" style={{ display: 'flex', marginTop: '1rem' }}>
                  <input type="number" className="duration-input"
                    value={Math.floor((activeTaskTimers[viewingTask.id].time) / 60)}
                    min="1"
                    onChange={(e) => updateTaskTimerDuration(viewingTask.id, e.target.value)} />
                  <span className="timer-display">{formatTime(activeTaskTimers[viewingTask.id].time)}</span>
                  <div className="focus-controls">
                    <button className="btn-small btn-play" onClick={() => startTaskTimer(viewingTask.id)}>
                      {Icons.Play}
                    </button>
                    <button className="btn-small btn-pause" onClick={() => pauseTaskTimer(viewingTask.id)}>
                      {Icons.Pause}
                    </button>
                    <button className="btn-small btn-stop" onClick={() => stopTaskTimer(viewingTask.id, viewingTask.focus_duration)}>
                      {Icons.Stop}
                    </button>
                  </div>
                </div>
              )}
            </div>

          </div>
        </div>
      )}

      {/* Alarm Modal */}
      {alarmMessage && (
        <div id="alarmModal" className="edit-form-overlay active" style={{ zIndex: 2000, background: 'rgba(50, 0, 0, 0.9)' }}>
          <div className="edit-modal" style={{ alignItems: 'center', textAlign: 'center', borderColor: '#ef4444', maxWidth: '400px' }}>
            <div style={{ fontSize: '4rem', marginBottom: '1rem' }}>&#9200;</div>
            <h2 style={{ color: '#fff', marginBottom: '2rem' }}>{alarmMessage}</h2>
            <button onClick={stopAlarm} className="add-btn" style={{ background: '#ef4444', width: '100%', padding: '1rem', fontSize: '1.2rem' }}>
              STOP ALARM
            </button>
          </div>
        </div>
      )}
      {/* In-App Toast */}
      {toast && (
        <div className="in-app-toast" style={{ position: 'fixed', bottom: '2rem', right: '2rem', background: 'rgba(30, 27, 75, 0.95)', border: '1px solid #6366f1', padding: '1.25rem', borderRadius: '1rem', color: 'white', maxWidth: '350px', zIndex: 6000, backdropFilter: 'blur(12px)', boxShadow: '0 10px 30px rgba(0,0,0,0.4)', display: 'flex', alignItems: 'center', gap: '1rem' }}>
          <div style={{ background: '#6366f1', width: '45px', height: '45px', borderRadius: '0.75rem', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
            <span style={{ fontSize: '1.5rem' }}>🔔</span>
          </div>
          <div style={{ flex: 1 }}>
            <div style={{ fontWeight: 'bold', fontSize: '1rem', marginBottom: '0.2rem' }}>{toast.title}</div>
            <div style={{ fontSize: '0.85rem', color: 'rgba(255,255,255,0.7)' }}>{toast.message}</div>
          </div>
          <button onClick={() => setToast(null)} style={{ background: 'transparent', border: 'none', color: 'rgba(255,255,255,0.4)', cursor: 'pointer', fontSize: '1.5rem', padding: '0.5rem' }}>&times;</button>
        </div>
      )}
    </div>
  );
}

export default App;
