import Dexie from 'dexie';

export const db = new Dexie('SwifyDatabase');

// Schema definition
db.version(2).stores({
    tasks: '++id, title, category, priority, completed, due_date, color, is_pinned, tags, recurrence, created_at',
    subtasks: '++id, taskId, text, completed',
    attachments: '++id, taskId, file_data, file_name, file_type',
    reminders: 'taskId' // taskId is the primary key
});

export default db;
