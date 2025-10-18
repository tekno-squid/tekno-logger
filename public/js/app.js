// Tekno Logger Dashboard JavaScript
// Handles UI interactions and API calls

class TeknoLogger {
    constructor() {
        this.currentProject = null;
        this.init();
    }

    init() {
        this.setupTabs();
        this.setupEventListeners();
        this.loadDashboard();
    }

    setupTabs() {
        const tabButtons = document.querySelectorAll('.tab-button');
        const tabContents = document.querySelectorAll('.tab-content');

        tabButtons.forEach(button => {
            button.addEventListener('click', () => {
                const targetTab = button.dataset.tab;
                
                // Update buttons
                tabButtons.forEach(btn => btn.classList.remove('active'));
                button.classList.add('active');
                
                // Update content
                tabContents.forEach(content => content.classList.remove('active'));
                document.getElementById(targetTab).classList.add('active');
                
                // Load tab-specific data
                this.loadTabData(targetTab);
            });
        });
    }

    setupEventListeners() {
        // Search functionality
        document.getElementById('search-btn').addEventListener('click', () => {
            this.performSearch();
        });

        // Alert form
        document.getElementById('alert-form').addEventListener('submit', (e) => {
            e.preventDefault();
            this.saveAlertSettings();
        });

        // Test alert button
        document.getElementById('test-alert').addEventListener('click', () => {
            this.sendTestAlert();
        });

        // New project button
        document.getElementById('new-project-btn').addEventListener('click', () => {
            this.createNewProject();
        });
    }

    async loadTabData(tab) {
        switch (tab) {
            case 'dashboard':
                await this.loadDashboard();
                break;
            case 'search':
                await this.loadProjects();
                break;
            case 'alerts':
                await this.loadAlertSettings();
                break;
            case 'projects':
                await this.loadProjectsList();
                break;
        }
    }

    async loadDashboard() {
        try {
            // Load dashboard stats
            const stats = await this.apiCall('/api/stats');
            document.getElementById('error-rate').textContent = `${stats.errorRate}%`;
            document.getElementById('total-events').textContent = stats.totalEvents.toLocaleString();
            document.getElementById('top-fingerprint').textContent = stats.topFingerprint || 'None';

            // Load recent errors
            const recentErrors = await this.apiCall('/logs?level=error&limit=5');
            this.renderLogs(recentErrors.logs, 'recent-errors-list');
        } catch (error) {
            console.error('Failed to load dashboard:', error);
            this.showError('Failed to load dashboard data');
        }
    }

    async loadProjects() {
        try {
            const projects = await this.apiCall('/admin/projects');
            const select = document.getElementById('search-project');
            select.innerHTML = '<option value="">All Projects</option>';
            
            projects.forEach(project => {
                const option = document.createElement('option');
                option.value = project.id;
                option.textContent = project.name;
                select.appendChild(option);
            });
        } catch (error) {
            console.error('Failed to load projects:', error);
        }
    }

    async performSearch() {
        const project = document.getElementById('search-project').value;
        const level = document.getElementById('search-level').value;
        const query = document.getElementById('search-query').value;
        
        const params = new URLSearchParams();
        if (project) params.set('project_id', project);
        if (level) params.set('level', level);
        if (query) params.set('q', query);
        params.set('limit', '50');

        try {
            const results = await this.apiCall(`/logs?${params}`);
            this.renderLogs(results.logs, 'search-results');
        } catch (error) {
            console.error('Search failed:', error);
            this.showError('Search failed');
        }
    }

    renderLogs(logs, containerId) {
        const container = document.getElementById(containerId);
        
        if (!logs || logs.length === 0) {
            container.innerHTML = '<p class="loading">No logs found</p>';
            return;
        }

        const html = logs.map(log => `
            <div class="log-entry ${log.level}">
                <div class="log-entry-header">
                    <span class="log-level ${log.level}">${log.level}</span>
                    <span class="log-timestamp">${new Date(log.ts).toLocaleString()}</span>
                </div>
                <div class="log-message">${this.escapeHtml(log.message)}</div>
                <div class="log-context">
                    <strong>Source:</strong> ${log.source} | 
                    <strong>Env:</strong> ${log.env}
                    ${log.ctx_json ? `| <span class="expandable" onclick="this.nextSibling.style.display = this.nextSibling.style.display === 'none' ? 'block' : 'none'">Context</span><pre style="display:none; margin-top:5px; background:#f0f0f0; padding:5px; border-radius:3px;">${JSON.stringify(JSON.parse(log.ctx_json), null, 2)}</pre>` : ''}
                </div>
            </div>
        `).join('');
        
        container.innerHTML = html;
    }

    async loadAlertSettings() {
        // Implementation for loading alert settings
        // This would call the admin API to get current alert configuration
    }

    async saveAlertSettings() {
        const enabled = document.getElementById('alerts-enabled').checked;
        const webhook = document.getElementById('discord-webhook').value;
        const spikeThreshold = document.getElementById('spike-threshold').value;
        const errorThreshold = document.getElementById('error-threshold').value;

        try {
            await this.apiCall('/admin/alerts', {
                method: 'POST',
                body: JSON.stringify({
                    enabled,
                    discord_webhook: webhook,
                    spike_n: parseInt(spikeThreshold),
                    error_rate_n: parseInt(errorThreshold)
                })
            });
            this.showSuccess('Alert settings saved');
        } catch (error) {
            console.error('Failed to save alert settings:', error);
            this.showError('Failed to save settings');
        }
    }

    async sendTestAlert() {
        try {
            await this.apiCall('/admin/alerts/test', { method: 'POST' });
            this.showSuccess('Test alert sent');
        } catch (error) {
            console.error('Failed to send test alert:', error);
            this.showError('Failed to send test alert');
        }
    }

    async loadProjectsList() {
        // Implementation for loading and managing projects
    }

    async createNewProject() {
        const name = prompt('Enter project name:');
        if (!name) return;

        try {
            const project = await this.apiCall('/admin/projects', {
                method: 'POST',
                body: JSON.stringify({ name })
            });
            this.showSuccess(`Project created: ${project.name}`);
            this.loadProjectsList();
        } catch (error) {
            console.error('Failed to create project:', error);
            this.showError('Failed to create project');
        }
    }

    async apiCall(endpoint, options = {}) {
        const defaultOptions = {
            method: 'GET',
            headers: {
                'Content-Type': 'application/json'
            }
        };

        const response = await fetch(endpoint, { ...defaultOptions, ...options });
        
        if (!response.ok) {
            throw new Error(`API call failed: ${response.status}`);
        }
        
        return response.json();
    }

    escapeHtml(text) {
        const div = document.createElement('div');
        div.textContent = text;
        return div.innerHTML;
    }

    showError(message) {
        // Simple error notification - could be enhanced with a toast system
        alert(`Error: ${message}`);
    }

    showSuccess(message) {
        // Simple success notification - could be enhanced with a toast system
        alert(`Success: ${message}`);
    }
}

// Initialize the application when DOM is loaded
document.addEventListener('DOMContentLoaded', () => {
    new TeknoLogger();
});