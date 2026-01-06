import db from './db';

// Helper to convert FormData to a plain object
const formDataToObject = (formData) => {
    const obj = {};
    formData.forEach((value, key) => {
        if (key === 'attachment') return; // Handled separately
        obj[key] = value;
    });
    return obj;
};

export const getTasks = async (category, q) => {
    let collection = db.tasks.toCollection();

    // Sorting: Pinned first, then completed last, then priority, then due date
    let tasks = await db.tasks.toArray();

    // Filter
    if (category && category !== 'all') {
        tasks = tasks.filter(t => t.category === category);
    }
    if (q) {
        const search = q.toLowerCase();
        tasks = tasks.filter(t =>
            t.title.toLowerCase().includes(search) ||
            (t.description && t.description.toLowerCase().includes(search)) ||
            (t.tags && t.tags.toLowerCase().includes(search))
        );
    }

    // Sort
    tasks.sort((a, b) => {
        if (a.is_pinned !== b.is_pinned) return b.is_pinned ? 1 : -1;
        if (a.completed !== b.completed) return a.completed ? 1 : -1;

        const priorities = { 'High': 1, 'Medium': 2, 'Low': 3 };
        const pa = priorities[a.priority] || 4;
        const pb = priorities[b.priority] || 4;
        if (pa !== pb) return pa - pb;

        if (a.due_date && b.due_date) return new Date(a.due_date) - new Date(b.due_date);
        return new Date(b.created_at) - new Date(a.created_at);
    });

    // Get subtasks and attachments for each task
    for (let task of tasks) {
        task.subtasks = await db.subtasks.where('taskId').equals(task.id).toArray();
        const atts = await db.attachments.where('taskId').equals(task.id).toArray();
        task.attachments = atts.map(a => ({
            id: a.id,
            file_path: URL.createObjectURL(a.file_data), // Create local URL
            file_type: a.file_type,
            file_name: a.file_name
        }));
    }

    // Counts
    const allTasks = await db.tasks.toArray();
    const counts = {
        'all': allTasks.length,
        'Personal': allTasks.filter(t => t.category === 'Personal').length,
        'Work': allTasks.filter(t => t.category === 'Work').length,
        'todo': allTasks.filter(t => t.category === 'TO-DO').length
    };

    return { data: { tasks, counts } };
};

export const addTask = async (formData) => {
    const taskData = formDataToObject(formData);

    // Add task
    const id = await db.tasks.add({
        ...taskData,
        completed: false,
        is_pinned: false,
        created_at: new Date().toISOString()
    });

    // Add attachments
    const files = formData.getAll('attachment');
    for (const file of files) {
        if (file.name) {
            await db.attachments.add({
                taskId: id,
                file_data: file,
                file_name: file.name,
                file_type: file.type
            });
        }
    }

    return { data: { id, ...taskData } };
};

export const updateTask = async (id, formData) => {
    const updates = formDataToObject(formData);
    const taskId = parseInt(id);

    // Update main task
    await db.tasks.update(taskId, updates);

    // Handle deleted subtasks
    const deletedSubtasks = formData.get('deleted_subtasks');
    if (deletedSubtasks) {
        const ids = deletedSubtasks.split(',').map(s => parseInt(s));
        await db.subtasks.bulkDelete(ids);
    }

    // Update existing subtasks
    formData.forEach(async (value, key) => {
        if (key.startsWith('subtask_content_')) {
            const subId = parseInt(key.split('_')[2]);
            await db.subtasks.update(subId, { text: value });
        }
    });

    // Handle deleted attachments
    const deletedAtts = formData.get('deleted_attachments');
    if (deletedAtts) {
        const ids = deletedAtts.split(',').map(a => parseInt(a));
        await db.attachments.bulkDelete(ids);
    }

    // Add new attachments
    const files = formData.getAll('attachment');
    for (const file of files) {
        if (file.name) {
            await db.attachments.add({
                taskId: taskId,
                file_data: file,
                file_name: file.name,
                file_type: file.type
            });
        }
    }

    return { data: { success: true } };
};

export const togglePin = async (id) => {
    const task = await db.tasks.get(id);
    await db.tasks.update(id, { is_pinned: !task.is_pinned });
    return { data: { success: true } };
};

export const completeTask = async (id) => {
    const task = await db.tasks.get(id);
    await db.tasks.update(id, { completed: !task.completed });
    return { data: { success: true } };
};

export const deleteTask = async (id) => {
    const taskId = parseInt(id);
    await db.tasks.delete(taskId);
    await db.subtasks.where('taskId').equals(taskId).delete();
    await db.attachments.where('taskId').equals(taskId).delete();
    return { data: { success: true } };
};

export const addSubtask = async (taskId, text) => {
    const id = await db.subtasks.add({
        taskId: parseInt(taskId),
        text,
        completed: false
    });
    return { data: { id, text, completed: false } };
};

export const toggleSubtask = async (id) => {
    const sub = await db.subtasks.get(id);
    await db.subtasks.update(id, { completed: !sub.completed });
    return { data: { success: true } };
};

export const deleteSubtask = async (id) => {
    await db.subtasks.delete(parseInt(id));
    return { data: { success: true } };
};

export const getReminderHistory = async (taskId) => {
    const entry = await db.reminders.get(taskId);
    return entry ? entry.history : {};
};

export const setReminderHistory = async (taskId, history) => {
    await db.reminders.put({ taskId, history });
};

export default {
    getTasks, addTask, updateTask, togglePin, completeTask, deleteTask, addSubtask, toggleSubtask, deleteSubtask, getReminderHistory, setReminderHistory
};
