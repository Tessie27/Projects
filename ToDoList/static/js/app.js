class TodoApp {
    constructor() {
        this.init();
    }

    init() {
        this.setupEventListeners();
        this.updateDateTime();
        this.loadStats();
        this.loadWeather();
        this.setupCharacterCounter();
        this.setMinDate();
        
        // Update time every minute
        setInterval(() => this.updateDateTime(), 60000);
    }

    setupEventListeners() {
        // Task form submission
        const taskForm = document.getElementById('task-form');
        if (taskForm) {
            taskForm.addEventListener('submit', (e) => this.handleAddTask(e));
        }

        // Task list interactions
        const todoList = document.getElementById('todo-list');
        if (todoList) {
            todoList.addEventListener('click', (e) => this.handleTaskActions(e));
        }

        // Filter tasks
        const filterSelect = document.getElementById('filter-select');
        if (filterSelect) {
            filterSelect.addEventListener('change', () => this.filterTasks());
        }

        // Weather search
        const weatherBtn = document.getElementById('weather-btn');
        const cityInput = document.getElementById('city-input');
        if (weatherBtn) {
            weatherBtn.addEventListener('click', () => this.loadWeather());
        }
        if (cityInput) {
            cityInput.addEventListener('keypress', (e) => {
                if (e.key === 'Enter') this.loadWeather();
            });
        }
    }

    setMinDate() {
        const dueDateInput = document.getElementById('due-date-input');
        if (dueDateInput) {
            const today = new Date().toISOString().split('T')[0];
            dueDateInput.min = today;
        }
    }

    setupCharacterCounter() {
        const descriptionInput = document.getElementById('description-input');
        const charCount = document.getElementById('char-count');
        
        if (descriptionInput && charCount) {
            descriptionInput.addEventListener('input', () => {
                charCount.textContent = descriptionInput.value.length;
            });
        }
    }

    updateDateTime() {
        const dateElement = document.getElementById('date');
        if (dateElement) {
            const now = new Date();
            const options = { 
                weekday: 'long', 
                year: 'numeric', 
                month: 'long', 
                day: 'numeric',
                hour: '2-digit',
                minute: '2-digit'
            };
            dateElement.textContent = now.toLocaleDateString('en-US', options);
        }
    }

    async handleAddTask(e) {
        e.preventDefault();
        
        const taskInput = document.getElementById('task-input');
        const dueDateInput = document.getElementById('due-date-input');
        const descriptionInput = document.getElementById('description-input');
        const priorityInput = document.getElementById('priority-input');
        
        const taskData = {
            task: taskInput.value.trim(),
            due_date: dueDateInput.value,
            description: descriptionInput.value.trim(),
            priority: parseInt(priorityInput.value)
        };

        if (!taskData.task) {
            this.showToast('Please enter a task name', 'warning');
            return;
        }

        try {
            const response = await fetch('/add', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify(taskData)
            });

            const data = await response.json();

            if (response.ok) {
                this.addTaskToDOM(data);
                this.resetForm();
                this.loadStats();
                this.showToast('Task added successfully!', 'success');
            } else {
                this.showToast(data.error || 'Error adding task', 'error');
            }
        } catch (error) {
            console.error('Error adding task:', error);
            this.showToast('Network error. Please try again.', 'error');
        }
    }

    addTaskToDOM(task) {
        const todoList = document.getElementById('todo-list');
        const emptyState = document.getElementById('empty-state');
        
        if (emptyState) {
            emptyState.classList.add('d-none');
        }

        const taskElement = this.createTaskElement(task);
        todoList.appendChild(taskElement);
    }

    createTaskElement(task) {
        const div = document.createElement('div');
        div.className = 'task-item';
        div.setAttribute('data-task-id', task.id);
        div.setAttribute('data-completed', task.completed);
        div.setAttribute('data-priority', task.priority);
        if (task.due_date) div.setAttribute('data-due-date', task.due_date);

        const isOverdue = task.due_date && !task.completed && new Date(task.due_date) < new Date();
        
        div.innerHTML = `
            <div class="task-card ${task.completed ? 'completed' : ''} priority-${task.priority}">
                <div class="task-header">
                    <div class="task-title-section">
                        <input type="checkbox" class="task-checkbox" 
                               ${task.completed ? 'checked' : ''} 
                               data-task-id="${task.id}">
                        <span class="task-title">${this.escapeHtml(task.name)}</span>
                    </div>
                    <div class="task-actions">
                        <span class="priority-badge priority-${task.priority}">
                            ${task.priority === 3 ? '🔥' : task.priority === 2 ? '⚡' : '💤'}
                        </span>
                        <button class="btn btn-sm btn-outline-danger delete-btn" 
                                data-task-id="${task.id}">
                            <i class="bi bi-trash"></i>
                        </button>
                    </div>
                </div>
                
                ${task.due_date ? `
                <div class="task-due-date">
                    <i class="bi bi-calendar me-1"></i>
                    <span class="due-text">${task.due_date}</span>
                    ${isOverdue ? '<span class="badge bg-danger ms-2">Overdue</span>' : ''}
                </div>
                ` : ''}
                
                ${task.description ? `
                <div class="task-description">
                    ${this.escapeHtml(task.description)}
                </div>
                ` : ''}
                
                <div class="task-footer">
                    <small class="text-muted">
                        Created: ${task.created_at ? task.created_at.slice(0, 10) : 'Today'}
                    </small>
                </div>
            </div>
        `;

        return div;
    }

    async handleTaskActions(e) {
        const target = e.target;
        const taskId = target.closest('[data-task-id]')?.getAttribute('data-task-id');
        
        if (!taskId) return;

        // Delete task
        if (target.closest('.delete-btn')) {
            if (confirm('Are you sure you want to delete this task?')) {
                await this.deleteTask(taskId);
            }
            return;
        }

        // Toggle completion
        if (target.classList.contains('task-checkbox') || target.closest('.task-checkbox')) {
            const checkbox = target.classList.contains('task-checkbox') ? target : target.closest('.task-checkbox');
            await this.toggleTaskCompletion(taskId, checkbox.checked);
            return;
        }
    }

    async toggleTaskCompletion(taskId, completed) {
        try {
            const response = await fetch(`/update/${taskId}`, {
                method: 'PUT',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({ completed })
            });

            if (response.ok) {
                const taskElement = document.querySelector(`[data-task-id="${taskId}"]`);
                const taskCard = taskElement.querySelector('.task-card');
                
                if (completed) {
                    taskCard.classList.add('completed');
                    taskElement.setAttribute('data-completed', 'true');
                } else {
                    taskCard.classList.remove('completed');
                    taskElement.setAttribute('data-completed', 'false');
                }
                
                this.loadStats();
                this.showToast(`Task marked as ${completed ? 'completed' : 'pending'}`, 'success');
            } else {
                this.showToast('Error updating task', 'error');
            }
        } catch (error) {
            console.error('Error updating task:', error);
            this.showToast('Network error. Please try again.', 'error');
        }
    }

    async deleteTask(taskId) {
        try {
            const response = await fetch(`/remove/${taskId}`, {
                method: 'DELETE'
            });

            if (response.ok) {
                const taskElement = document.querySelector(`[data-task-id="${taskId}"]`);
                taskElement.remove();
                
                // Show empty state if no tasks left
                const todoList = document.getElementById('todo-list');
                const emptyState = document.getElementById('empty-state');
                if (todoList.children.length === 0 && emptyState) {
                    emptyState.classList.remove('d-none');
                }
                
                this.loadStats();
                this.showToast('Task deleted successfully', 'success');
            } else {
                const data = await response.json();
                this.showToast(data.error || 'Error deleting task', 'error');
            }
        } catch (error) {
            console.error('Error deleting task:', error);
            this.showToast('Network error. Please try again.', 'error');
        }
    }

    async loadStats() {
        try {
            const response = await fetch('/stats');
            if (response.ok) {
                const stats = await response.json();
                this.updateStatsDisplay(stats);
            }
        } catch (error) {
            console.error('Error loading stats:', error);
        }
    }

    updateStatsDisplay(stats) {
        const elements = {
            'total-tasks': stats.total || 0,
            'completed-tasks': stats.completed || 0,
            'pending-tasks': stats.pending || 0,
            'overdue-tasks': stats.overdue || 0
        };

        for (const [id, value] of Object.entries(elements)) {
            const element = document.getElementById(id);
            if (element) {
                element.textContent = value;
            }
        }
    }

    async loadWeather() {
        const cityInput = document.getElementById('city-input');
        const weatherDisplay = document.getElementById('weather-display');
        const city = cityInput.value.trim() || 'Johannesburg';

        if (!weatherDisplay) return;

        weatherDisplay.innerHTML = '<div class="loading">Loading...</div>';

        try {
            const response = await fetch(`/weather?city=${encodeURIComponent(city)}`);
            const data = await response.json();

            if (response.ok) {
                const iconUrl = `https://openweathermap.org/img/wn/${data.icon}@2x.png`;
                weatherDisplay.innerHTML = `
                    <div class="weather-city">${data.city}</div>
                    <div class="weather-temp">${data.temperature}°C</div>
                    <div class="weather-desc">
                        <img src="${iconUrl}" alt="${data.description}" class="weather-icon">
                        ${data.description}
                    </div>
                    <div class="weather-details">
                        <span>💧 ${data.humidity}%</span>
                        <span>💨 ${data.wind_speed} m/s</span>
                    </div>
                `;
            } else {
                weatherDisplay.innerHTML = `<div class="weather-error">${data.error}</div>`;
            }
        } catch (error) {
            console.error('Weather error:', error);
            weatherDisplay.innerHTML = '<div class="weather-error">Weather unavailable</div>';
        }
    }

    filterTasks() {
        const filter = document.getElementById('filter-select').value;
        const tasks = document.querySelectorAll('.task-item');
        const now = new Date().toISOString().split('T')[0];

        tasks.forEach(task => {
            const isCompleted = task.getAttribute('data-completed') === 'true';
            const dueDate = task.getAttribute('data-due-date');
            const isOverdue = dueDate && !isCompleted && dueDate < now;

            let show = true;
            
            switch (filter) {
                case 'pending':
                    show = !isCompleted;
                    break;
                case 'completed':
                    show = isCompleted;
                    break;
                case 'overdue':
                    show = isOverdue;
                    break;
            }

            task.style.display = show ? 'block' : 'none';
        });
    }

    resetForm() {
        const form = document.getElementById('task-form');
        if (form) form.reset();
        
        const charCount = document.getElementById('char-count');
        if (charCount) charCount.textContent = '0';
    }

    showToast(message, type = 'info') {
        const toastContainer = document.getElementById('toast-container');
        if (!toastContainer) return;

        const toastId = 'toast-' + Date.now();
        const bgClass = {
            'success': 'bg-success',
            'error': 'bg-danger',
            'warning': 'bg-warning',
            'info': 'bg-info'
        }[type] || 'bg-info';

        const toastHTML = `
            <div id="${toastId}" class="toast align-items-center text-white ${bgClass} border-0" role="alert">
                <div class="d-flex">
                    <div class="toast-body">
                        <i class="bi ${this.getToastIcon(type)} me-2"></i>
                        ${message}
                    </div>
                    <button type="button" class="btn-close btn-close-white me-2 m-auto" data-bs-dismiss="toast"></button>
                </div>
            </div>
        `;

        toastContainer.insertAdjacentHTML('beforeend', toastHTML);
        
        const toastElement = document.getElementById(toastId);
        const toast = new bootstrap.Toast(toastElement, { delay: 4000 });
        toast.show();

        // Remove from DOM after hide
        toastElement.addEventListener('hidden.bs.toast', () => {
            toastElement.remove();
        });
    }

    getToastIcon(type) {
        const icons = {
            'success': 'bi-check-circle-fill',
            'error': 'bi-exclamation-triangle-fill',
            'warning': 'bi-exclamation-circle-fill',
            'info': 'bi-info-circle-fill'
        };
        return icons[type] || 'bi-info-circle-fill';
    }

    escapeHtml(unsafe) {
        return unsafe
            .replace(/&/g, "&amp;")
            .replace(/</g, "&lt;")
            .replace(/>/g, "&gt;")
            .replace(/"/g, "&quot;")
            .replace(/'/g, "&#039;");
    }
}

// Initialize the app when DOM is loaded
document.addEventListener('DOMContentLoaded', () => {
    new TodoApp();
});