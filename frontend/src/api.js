import axios from 'axios';

const api = axios.create({
    baseURL: '/api'
});

// Attach Unique User ID to every request for multi-user isolation
api.interceptors.request.use((config) => {
    let userId = localStorage.getItem('swify_user_id');
    if (!userId) {
        // Generate a simple unique ID if it doesn't exist
        userId = 'user_' + Math.random().toString(36).substr(2, 9) + Date.now().toString(36);
        localStorage.setItem('swify_user_id', userId);
    }
    config.headers['X-User-ID'] = userId;
    return config;
}, (error) => {
    return Promise.reject(error);
});

export const getTasks = (category, q) => api.get('/tasks', { params: { category, q } });
export const addTask = (data) => api.post('/tasks', data);
export const updateTask = (id, data) => api.put(`/tasks/${id}`, data);
export const togglePin = (id) => api.post(`/tasks/${id}/toggle-pin`);
export const completeTask = (id) => api.post(`/tasks/${id}/complete`);
export const deleteTask = (id) => api.delete(`/tasks/${id}`);
export const addSubtask = (taskId, text) => api.post(`/tasks/${taskId}/subtasks`, { text });
export const toggleSubtask = (id) => api.post(`/subtasks/${id}/toggle`);
export const deleteSubtask = (id) => api.delete(`/subtasks/${id}`);

export default api;
