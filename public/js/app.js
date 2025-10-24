// Tekno Logger Dashboard JavaScript
// Modern ES6+ implementation with comprehensive API integration

class TeknoLogger {
    constructor() {
        console.log('📋 TeknoLogger - Initializing...');
        this.currentProject = null;
        this.currentPage = 1;
        this.resultsPerPage = 50;
        this.adminToken = localStorage.getItem('tekno-logger-admin-token');
        
        this.init();
    }

    async init() {
        try {
            console.log('🔧 Setting up tabs and event listeners...');
            this.setupTabs();
            this.setupEventListeners();
            this.initializeTheme();
            this.updateLogoutButtonVisibility();
            
            // Check authentication before allowing ANY access
            if (!this.adminToken) {
                console.log('🔒 No admin token found - requiring authentication...');
                this.hideMainContent();
                await this.promptForAdminToken();
            }
            
            console.log('🏥 Checking service health...');
            await this.checkServiceHealth();
            
            console.log('📊 Loading dashboard...');
            await this.loadDashboard();
            
            console.log('✅ TeknoLogger - Ready!');
        } catch (error) {
            console.error('❌ Initialization failed:', error);
            this.showToast('Failed to initialize dashboard', 'error');
        }
    }

    // ===== TAB MANAGEMENT =====
    setupTabs() {
        const tabButtons = document.querySelectorAll('.tab-button');
        const tabContents = document.querySelectorAll('.tab-content');

        tabButtons.forEach(button => {
            button.addEventListener('click', () => {
                const targetTab = button.dataset.tab;
                console.log('🔥 Tab clicked:', targetTab);
                
                // Update button states
                tabButtons.forEach(btn => btn.classList.remove('active'));
                button.classList.add('active');
                
                // Update content visibility
                tabContents.forEach(content => content.classList.remove('active'));
                document.getElementById(targetTab).classList.add('active');
                
                // Load tab-specific data
                this.loadTabData(targetTab);
            });
        });
    }

    async loadTabData(tabName) {
        try {
            console.log('Loading tab:', tabName, 'Admin token present:', !!this.adminToken);
            
            // Authentication is handled at the app level, not per-tab
            switch (tabName) {
                case 'dashboard':
                    await this.loadDashboard();
                    break;
                case 'search':
                    await this.loadSearchProjects();
                    break;
                case 'projects':
                    await this.loadProjects();
                    break;
                case 'testing':
                    await this.loadTesting();
                    break;
                case 'admin':
                    await this.loadAdminData();
                    break;
            }
        } catch (error) {
            console.log('Error in loadTabData:', error.message);
            this.showToast(`Failed to load ${tabName} data`, 'error');
            console.error(`Failed to load ${tabName}:`, error);
        }
    }

    // ===== EVENT LISTENERS =====
    setupEventListeners() {
        // Dashboard refresh
        document.getElementById('refresh-errors')?.addEventListener('click', () => {
            this.loadRecentErrors();
        });

        // Search functionality
        document.getElementById('search-btn').addEventListener('click', () => {
            this.performSearch();
        });

        document.getElementById('clear-search-btn').addEventListener('click', () => {
            this.clearSearch();
        });

        // Search on Enter key
        document.getElementById('search-query').addEventListener('keypress', (e) => {
            if (e.key === 'Enter') {
                this.performSearch();
            }
        });

        // Project management
        document.getElementById('new-project-btn')?.addEventListener('click', () => {
            this.showNewProjectModal();
        });

        document.getElementById('close-new-project')?.addEventListener('click', () => {
            this.hideNewProjectModal();
        });

        document.getElementById('cancel-new-project')?.addEventListener('click', () => {
            this.hideNewProjectModal();
        });

        document.getElementById('new-project-form')?.addEventListener('submit', (e) => {
            e.preventDefault();
            this.createProject();
        });

        // Auto-generate slug from name
        document.getElementById('project-name')?.addEventListener('input', (e) => {
            const slug = e.target.value
                .toLowerCase()
                .replace(/[^a-z0-9\s-]/g, '')
                .replace(/\s+/g, '-')
                .replace(/-+/g, '-')
                .replace(/^-|-$/g, '');
            document.getElementById('project-slug').value = slug;
        });

        // Login modal functionality
        document.getElementById('login-form')?.addEventListener('submit', (e) => {
            e.preventDefault();
            this.handleLogin();
        });

        document.getElementById('logout-btn')?.addEventListener('click', () => {
            this.logout();
        });

        // Theme toggle functionality
        document.getElementById('theme-toggle')?.addEventListener('click', () => {
            this.toggleTheme();
        });

        // Testing functionality
        document.getElementById('send-test-log')?.addEventListener('click', () => {
            this.sendTestLog();
        });

        document.getElementById('send-batch-logs')?.addEventListener('click', () => {
            this.sendBatchLogs();
        });

        // Quick scenario buttons
        document.querySelectorAll('.scenario-btn').forEach(btn => {
            btn.addEventListener('click', () => {
                this.loadScenario(btn.dataset.scenario);
            });
        });

        // Service selection buttons
        document.getElementById('select-all-services')?.addEventListener('click', () => {
            this.selectAllServices(true);
        });

        document.getElementById('select-none-services')?.addEventListener('click', () => {
            this.selectAllServices(false);
        });

        // Admin functionality
        document.getElementById('trigger-maintenance')?.addEventListener('click', () => {
            this.triggerMaintenance();
        });

        document.getElementById('trigger-purge')?.addEventListener('click', () => {
            this.triggerPurge();
        });

        document.getElementById('refresh-health')?.addEventListener('click', () => {
            this.loadAdminData();
        });

        document.getElementById('clear-config-cache')?.addEventListener('click', () => {
            this.clearConfigCache();
        });

        document.getElementById('load-recent-logs')?.addEventListener('click', () => {
            this.loadRecentLogs();
        });
    }

    // ===== API HELPERS =====
    async apiCall(endpoint, options = {}) {
        const defaultOptions = {
            method: 'GET',
            headers: {
                'Content-Type': 'application/json',
            },
        };

        // Add admin token if required and available
        if (endpoint.startsWith('/admin') && this.adminToken) {
            defaultOptions.headers['X-Admin-Token'] = this.adminToken;
        }

        const finalOptions = { ...defaultOptions, ...options };
        
        if (finalOptions.body && typeof finalOptions.body === 'object') {
            finalOptions.body = JSON.stringify(finalOptions.body);
        }

        const response = await fetch(endpoint, finalOptions);
        
        if (!response.ok) {
            if (response.status === 401 && endpoint.startsWith('/admin')) {
                await this.promptForAdminToken();
                return this.apiCall(endpoint, options); // Retry with token
            }
            
            const errorData = await response.json().catch(() => ({ error: 'Unknown error' }));
            throw new Error(errorData.error || `HTTP ${response.status}`);
        }

        return response.json();
    }

    // ===== LOGIN MODAL FUNCTIONALITY =====
    
    async promptForAdminToken() {
        console.log('promptForAdminToken called');
        return new Promise((resolve, reject) => {
            this.showLoginModal(resolve, reject);
        });
    }

    showLoginModal(resolve = null, reject = null) {
        console.log('🔐 showLoginModal called with resolve:', !!resolve, 'reject:', !!reject);
        this.loginResolve = resolve;
        this.loginReject = reject;
        
        const modal = document.getElementById('login-modal-overlay');
        const form = document.getElementById('login-form');
        const errorDiv = document.getElementById('login-error');
        
        console.log('🔍 Modal element found:', !!modal);
        console.log('🔍 Form element found:', !!form);
        console.log('🔍 Error div found:', !!errorDiv);
        
        if (modal) {
            console.log('📊 Modal current display:', window.getComputedStyle(modal).display);
            console.log('📊 Modal current opacity:', window.getComputedStyle(modal).opacity);
            console.log('📊 Modal current classes:', modal.className);
        } else {
            console.error('❌ Modal element not found!');
            return;
        }
        
        // Clear previous state
        if (form) form.reset();
        if (errorDiv) {
            errorDiv.style.display = 'none';
            errorDiv.textContent = '';
        }
        
        // Show modal with proper CSS transitions
        modal.classList.add('visible');
        document.body.style.overflow = 'hidden';
        
        console.log('✅ Modal classes after adding visible:', modal.className);
        console.log('✅ Modal display after visible:', window.getComputedStyle(modal).display);
        
        // Add show class for animation after display is set
        requestAnimationFrame(() => {
            modal.classList.add('show');
            console.log('✅ Modal classes after adding show:', modal.className);
            console.log('✅ Modal opacity after show:', window.getComputedStyle(modal).opacity);
        });
        
        // Focus on token input
        setTimeout(() => {
            const tokenInput = document.getElementById('admin-token');
            if (tokenInput) tokenInput.focus();
        }, 100);
    }

    hideLoginModal(cancelled = true) {
        const modal = document.getElementById('login-modal-overlay');
        
        // Remove show class for animation
        modal.classList.remove('show');
        
        // Hide modal after animation completes
        setTimeout(() => {
            modal.classList.remove('visible');
            document.body.style.overflow = '';
        }, 200); // Match CSS transition duration
        
        // Only reject promise if it was cancelled, not if login succeeded
        if (cancelled && this.loginReject) {
            this.loginReject(new Error('Login cancelled'));
            this.loginReject = null;
            this.loginResolve = null;
        }
    }

    async handleLogin() {
        const tokenInput = document.getElementById('admin-token');
        const errorDiv = document.getElementById('login-error');
        const submitBtn = document.querySelector('#login-form button[type="submit"]');
        
        const token = tokenInput.value.trim();
        
        if (!token) {
            this.showLoginError('Please enter an admin token');
            return;
        }

        // Show loading state
        const originalText = submitBtn.textContent;
        submitBtn.textContent = 'Verifying...';
        submitBtn.disabled = true;

        try {
            // Test the token by making an admin API call
            const testResponse = await fetch('/admin/projects', {
                method: 'GET',
                headers: {
                    'Content-Type': 'application/json',
                    'X-Admin-Token': token
                }
            });

            if (testResponse.ok) {
                // Token is valid
                this.adminToken = token;
                localStorage.setItem('tekno-logger-admin-token', token);
                
                // Resolve promise if waiting BEFORE hiding modal
                if (this.loginResolve) {
                    this.loginResolve();
                    this.loginResolve = null;
                    this.loginReject = null;
                }
                
                this.hideLoginModal(false); // false = not cancelled, successful login
                this.updateLogoutButtonVisibility();
                this.showMainContent();
                
                // Load dashboard after successful authentication
                await this.loadDashboard();
            } else {
                throw new Error('Invalid admin token');
            }
        } catch (error) {
            this.showLoginError('Invalid admin token. Please check and try again.');
        } finally {
            // Reset button state
            submitBtn.textContent = originalText;
            submitBtn.disabled = false;
        }
    }

    showLoginError(message) {
        const errorDiv = document.getElementById('login-error');
        errorDiv.textContent = message;
        errorDiv.style.display = 'block';
    }

    logout() {
        this.adminToken = null;
        localStorage.removeItem('tekno-logger-admin-token');
        this.updateLogoutButtonVisibility();
        this.hideMainContent();
        
        // Show authentication required message
        this.showAuthenticationRequired();
    }

    updateLogoutButtonVisibility() {
        const logoutBtn = document.getElementById('logout-btn');
        if (logoutBtn) {
            logoutBtn.style.display = this.adminToken ? 'inline-flex' : 'none';
        }
    }

    // ===== THEME MANAGEMENT =====
    initializeTheme() {
        // Default to dark mode, but check localStorage for user preference
        const savedTheme = localStorage.getItem('tekno-logger-theme') || 'dark';
        this.setTheme(savedTheme);
    }

    toggleTheme() {
        const currentTheme = document.documentElement.getAttribute('data-theme') || 'light';
        const newTheme = currentTheme === 'dark' ? 'light' : 'dark';
        this.setTheme(newTheme);
    }

    setTheme(theme) {
        document.documentElement.setAttribute('data-theme', theme);
        localStorage.setItem('tekno-logger-theme', theme);
        
        // Update theme toggle icon
        const themeToggle = document.getElementById('theme-toggle');
        if (themeToggle) {
            themeToggle.textContent = theme === 'dark' ? '🌞' : '🌙';
            themeToggle.title = `Switch to ${theme === 'dark' ? 'light' : 'dark'} mode`;
        }
        
        console.log(`🎨 Theme switched to: ${theme}`);
    }

    hideMainContent() {
        const mainElement = document.querySelector('main');
        const navElement = document.querySelector('nav.tabs');
        
        if (mainElement) mainElement.style.display = 'none';
        if (navElement) navElement.style.display = 'none';
        
        // Show only header with login prompt
        this.showAuthenticationRequired();
    }

    showMainContent() {
        const mainElement = document.querySelector('main');
        const navElement = document.querySelector('nav.tabs');
        const authRequired = document.getElementById('auth-required-message');
        
        if (mainElement) mainElement.style.display = '';
        if (navElement) navElement.style.display = '';
        if (authRequired) authRequired.remove();
    }

    showAuthenticationRequired() {
        // Create a message showing authentication is required
        const existingMessage = document.getElementById('auth-required-message');
        if (existingMessage) return;

        const message = document.createElement('div');
        message.id = 'auth-required-message';
        
        message.innerHTML = `
            <div style="font-size: 48px; margin-bottom: 24px;">🔒</div>
            <h2>Authentication Required</h2>
            <p>
                This TeknoLogger dashboard requires administrator access. 
                Please authenticate with your admin token to continue.
            </p>
            <button onclick="window.logger.promptForAdminToken()">
                🔐 Login as Administrator
            </button>
        `;
        
        const container = document.querySelector('.container');
        if (container) {
            container.appendChild(message);
        }
    }

    // ===== SERVICE HEALTH =====
    async checkServiceHealth() {
        try {
            const health = await this.apiCall('/api/health');
            const statusElement = document.getElementById('service-status');
            
            if (statusElement) {
                const dot = statusElement.querySelector('.status-dot');
                const text = statusElement.querySelector('.status-text');
                
                if (health.checks?.database?.status === 'healthy') {
                    dot.className = 'status-dot status-healthy';
                    text.textContent = 'Healthy';
                } else {
                    dot.className = 'status-dot status-unhealthy';
                    text.textContent = 'Database Issue';
                }
            }
            
            return health;
        } catch (error) {
            const statusElement = document.getElementById('service-status');
            if (statusElement) {
                const dot = statusElement.querySelector('.status-dot');
                const text = statusElement.querySelector('.status-text');
                dot.className = 'status-dot status-unhealthy';
                text.textContent = 'Offline';
            }
            console.error('Health check failed:', error);
        }
    }

    // ===== DASHBOARD =====
    async loadDashboard() {
        try {
            await Promise.all([
                this.loadServiceStats(),
                this.loadRecentErrors(),
                this.loadTopFingerprints()
            ]);
        } catch (error) {
            console.error('Failed to load dashboard:', error);
        }
    }

    async loadServiceStats() {
        try {
            const stats = await this.apiCall('/api/stats');
            
            // Update stat cards
            document.getElementById('error-rate').textContent = `${stats.error_rate || 0}%`;
            document.getElementById('total-events').textContent = this.formatNumber(stats.total_events || 0);
            document.getElementById('total-projects').textContent = stats.total_projects || 0;
            
            // Update last maintenance
            const lastMaintenance = document.getElementById('last-maintenance');
            const maintenanceStatus = document.getElementById('maintenance-status');
            
            if (stats.maintenance?.last_run) {
                const date = new Date(stats.maintenance.last_run);
                lastMaintenance.textContent = this.formatRelativeTime(date);
                maintenanceStatus.textContent = stats.maintenance.in_progress ? 'Running...' : 'Idle';
            } else {
                lastMaintenance.textContent = 'Never';
                maintenanceStatus.textContent = 'Pending';
            }
            
        } catch (error) {
            console.error('Failed to load service stats:', error);
            // Set fallback values
            document.getElementById('error-rate').textContent = '--';
            document.getElementById('total-events').textContent = '--';
            document.getElementById('total-projects').textContent = '--';
            document.getElementById('last-maintenance').textContent = '--';
            document.getElementById('maintenance-status').textContent = 'Unknown';
        }
    }

    async loadRecentErrors() {
        try {
            const container = document.getElementById('recent-errors-list');
            container.innerHTML = '<div class="loading">Loading recent errors...</div>';
            
            // First check if we have any projects
            const projectsResponse = await this.apiCall('/admin/projects');
            
            if (!projectsResponse.projects || projectsResponse.projects.length === 0) {
                container.innerHTML = '<div class="no-data">No projects found. Create a project first to see error logs.</div>';
                return;
            }
            
            // For admin dashboard, show message that individual project logs need to be viewed per-project
            container.innerHTML = `
                <div class="info-message">
                    <h4>📊 Error Monitoring</h4>
                    <p>You have ${projectsResponse.projects.length} project(s) configured.</p>
                    <p>To view error logs, use the Search tab to filter logs by project and level.</p>
                    <div class="project-list">
                        ${projectsResponse.projects.map(project => `
                            <div class="project-item">
                                <strong>${this.escapeHtml(project.name)}</strong> (${this.escapeHtml(project.slug)})
                            </div>
                        `).join('')}
                    </div>
                </div>
            `;
            
        } catch (error) {
            document.getElementById('recent-errors-list').innerHTML = 
                '<div class="error-state">Failed to load dashboard data. Please check your admin token.</div>';
            console.error('Failed to load recent errors:', error);
        }
    }

    async loadTopFingerprints() {
        try {
            const container = document.getElementById('top-fingerprints');
            
            // For admin dashboard, show message about project-specific nature of fingerprints
            container.innerHTML = `
                <div class="info-message">
                    <h4>📊 Error Fingerprints</h4>
                    <p>Error fingerprints are tracked per-project to identify recurring issues.</p>
                    <p>Use the <strong>Search</strong> tab to view logs and identify error patterns within specific projects.</p>
                    <div class="fingerprint-tip">
                        <strong>💡 Tip:</strong> Filter by "Error" or "Fatal" level to see critical issues across your projects.
                    </div>
                </div>
            `;
        } catch (error) {
            document.getElementById('top-fingerprints').innerHTML = 
                '<div class="error-state">Unable to load fingerprints data</div>';
            console.error('Failed to load fingerprints:', error);
        }
    }

    // ===== SEARCH =====
    async loadSearchProjects() {
        try {
            const projects = await this.apiCall('/admin/projects');
            const select = document.getElementById('search-project');
            
            select.innerHTML = '<option value="">All Projects</option>';
            if (projects.projects) {
                projects.projects.forEach(project => {
                    select.innerHTML += `<option value="${project.id}">${this.escapeHtml(project.name)}</option>`;
                });
            }
        } catch (error) {
            console.error('Failed to load search projects:', error);
        }
    }

    async performSearch() {
        try {
            const container = document.getElementById('search-results');
            const countElement = document.getElementById('search-results-count');
            
            container.innerHTML = '<div class="loading">Searching...</div>';
            countElement.textContent = 'Searching...';
            
            // Gather search parameters
            const params = new URLSearchParams();
            
            const projectId = document.getElementById('search-project').value;
            const level = document.getElementById('search-level').value;
            const env = document.getElementById('search-env').value;
            const query = document.getElementById('search-query').value.trim();
            
            if (projectId) params.append('project_id', projectId);
            if (level) params.append('level', level);
            if (env) params.append('env', env);
            if (query) params.append('message', query);
            
            params.append('limit', '50');
            params.append('offset', '0');
            
            // Use admin search endpoint which doesn't require project auth
            const response = await this.apiCall(`/admin/logs/search?${params.toString()}`);
            
            this.renderSearchResults(response);
            
        } catch (error) {
            document.getElementById('search-results').innerHTML = 
                '<div class="error-state">Search failed: ' + this.escapeHtml(error.message) + '</div>';
            document.getElementById('search-results-count').textContent = 'Search failed';
            console.error('Search failed:', error);
        }
    }

    renderSearchResults(response) {
        const container = document.getElementById('search-results');
        const countElement = document.getElementById('search-results-count');
        
        if (response.logs && response.logs.length > 0) {
            countElement.textContent = `Found ${response.logs.length} results`;
            
            container.innerHTML = response.logs.map(log => {
                // ctx_json might be already parsed by MySQL or still a string
                let contextDisplay = '';
                if (log.ctx_json) {
                    try {
                        const ctx = typeof log.ctx_json === 'string' ? JSON.parse(log.ctx_json) : log.ctx_json;
                        contextDisplay = `<div class="log-context"><pre>${this.escapeHtml(JSON.stringify(ctx, null, 2))}</pre></div>`;
                    } catch (e) {
                        // If parsing fails, show raw value
                        contextDisplay = `<div class="log-context"><pre>${this.escapeHtml(String(log.ctx_json))}</pre></div>`;
                    }
                }
                
                return `
                    <div class="log-item">
                        <div class="log-header">
                            <span class="log-level ${log.level}">${log.level.toUpperCase()}</span>
                            <span class="log-time">${new Date(log.ts).toLocaleString()}</span>
                            <span class="log-source">${this.escapeHtml(log.source)}</span>
                            <span class="log-env">${this.escapeHtml(log.env)}</span>
                        </div>
                        <div class="log-message">${this.escapeHtml(log.message)}</div>
                        ${contextDisplay}
                    </div>
                `;
            }).join('');
        } else {
            countElement.textContent = 'No results found';
            container.innerHTML = '<div class="no-data">No logs match your search criteria</div>';
        }
    }

    clearSearch() {
        document.getElementById('search-project').value = '';
        document.getElementById('search-level').value = '';
        document.getElementById('search-env').value = '';
        document.getElementById('search-query').value = '';
        
        document.getElementById('search-results').innerHTML = `
            <div class="search-placeholder">
                <div class="placeholder-icon">🔍</div>
                <p>Use the filters above to search through your logs</p>
                <p class="placeholder-hint">Pro tip: Leave fields empty to search all values</p>
            </div>
        `;
        document.getElementById('search-results-count').textContent = 'Enter search criteria above';
    }

    // ===== PROJECTS =====
    async loadProjects() {
        try {
            const container = document.getElementById('projects-list');
            container.innerHTML = '<div class="loading">Loading projects...</div>';
            
            const response = await this.apiCall('/admin/projects');
            
            if (response.projects && response.projects.length > 0) {
                container.innerHTML = response.projects.map(project => `
                    <div class="project-card">
                        <div class="project-header">
                            <h4>${this.escapeHtml(project.name)}</h4>
                            <span class="project-slug">${this.escapeHtml(project.slug)}</span>
                        </div>
                        <div class="project-details">
                            <div class="project-stat">
                                <label>Retention:</label>
                                <span>${project.retention_days} days</span>
                            </div>
                            <div class="project-stat">
                                <label>Rate Limit:</label>
                                <span>${this.formatNumber(project.minute_cap)}/min</span>
                            </div>
                            <div class="project-stat">
                                <label>Created:</label>
                                <span>${new Date(project.created_at).toLocaleDateString()}</span>
                            </div>
                        </div>
                        <div class="project-actions">
                            <button onclick="logger.deleteProject(${project.id}, '${this.escapeHtml(project.name)}')" class="delete-btn">Delete</button>
                        </div>
                    </div>
                `).join('');
            } else {
                container.innerHTML = `
                    <div class="no-data">
                        <div class="no-data-icon">📁</div>
                        <p>No projects found</p>
                        <p class="no-data-hint">Create your first project to start logging</p>
                    </div>
                `;
            }
        } catch (error) {
            document.getElementById('projects-list').innerHTML = 
                '<div class="error-state">Failed to load projects</div>';
            console.error('Failed to load projects:', error);
        }
    }

    showNewProjectModal() {
        document.getElementById('new-project-modal').style.display = 'flex';
        document.getElementById('project-name').focus();
    }

    hideNewProjectModal() {
        document.getElementById('new-project-modal').style.display = 'none';
        document.getElementById('new-project-form').reset();
    }

    async createProject() {
        try {
            const formData = {
                name: document.getElementById('project-name').value.trim(),
                slug: document.getElementById('project-slug').value.trim(),
                retention_days: parseInt(document.getElementById('project-retention').value),
                minute_cap: parseInt(document.getElementById('project-rate-limit').value)
            };

            if (!this.adminToken) {
                await this.promptForAdminToken();
            }

            const response = await this.apiCall('/admin/projects', {
                method: 'POST',
                body: formData
            });

            this.showToast(`Project "${formData.name}" created successfully!`, 'success');
            this.hideNewProjectModal();
            await this.loadProjects();

            // Show API key to user
            if (response.project?.api_key) {
                alert(`Project created! Your API key is:\n\n${response.project.api_key}\n\nSave this key - it won't be shown again!`);
            }

        } catch (error) {
            this.showToast('Failed to create project: ' + error.message, 'error');
            console.error('Failed to create project:', error);
        }
    }

    async deleteProject(projectId, projectName) {
        if (!confirm(`Are you sure you want to delete "${projectName}"?\n\nThis will permanently delete all logs and cannot be undone.`)) {
            return;
        }

        try {
            if (!this.adminToken) {
                await this.promptForAdminToken();
            }

            await this.apiCall(`/admin/projects/${projectId}`, {
                method: 'DELETE'
            });

            this.showToast(`Project "${projectName}" deleted successfully`, 'success');
            await this.loadProjects();

        } catch (error) {
            this.showToast('Failed to delete project: ' + error.message, 'error');
            console.error('Failed to delete project:', error);
        }
    }

    // ===== ADMIN =====
    async loadAdminData() {
        try {
            await Promise.all([
                this.loadMaintenanceStatus(),
                this.loadHealthStatus(),
                this.loadServiceConfig()
            ]);
        } catch (error) {
            console.error('Failed to load admin data:', error);
        }
    }

    async loadMaintenanceStatus() {
        try {
            const container = document.getElementById('maintenance-status-section');
            container.innerHTML = '<div class="loading">Loading maintenance status...</div>';

            if (!this.adminToken) {
                container.innerHTML = '<div class="auth-required">Admin token required</div>';
                return;
            }

            const response = await this.apiCall('/admin/maintenance/status');
            const { maintenance } = response;

            container.innerHTML = `
                <div class="status-item">
                    <label>Last Run:</label>
                    <span>${maintenance.last_run ? this.formatRelativeTime(new Date(maintenance.last_run)) : 'Never'}</span>
                </div>
                <div class="status-item">
                    <label>Status:</label>
                    <span class="status-badge ${maintenance.in_progress ? 'running' : 'idle'}">
                        ${maintenance.in_progress ? 'Running' : 'Idle'}
                    </span>
                </div>
            `;

        } catch (error) {
            document.getElementById('maintenance-status-section').innerHTML = 
                '<div class="error-state">Failed to load maintenance status</div>';
            console.error('Failed to load maintenance status:', error);
        }
    }

    async loadHealthStatus() {
        try {
            const container = document.getElementById('health-status-section');
            container.innerHTML = '<div class="loading">Loading health status...</div>';

            const health = await this.apiCall('/api/health');

            container.innerHTML = `
                <div class="status-item">
                    <label>Database:</label>
                    <span class="status-badge ${health.checks?.database?.status === 'healthy' ? 'healthy' : 'unhealthy'}">
                        ${health.checks?.database?.status === 'healthy' ? 'Connected' : 'Disconnected'}
                    </span>
                </div>
                <div class="status-item">
                    <label>Version:</label>
                    <span>${health.service?.version || 'Unknown'}</span>
                </div>
            `;

        } catch (error) {
            document.getElementById('health-status-section').innerHTML = 
                '<div class="error-state">Failed to load health status</div>';
        }
    }

    async loadServiceConfig() {
        try {
            const container = document.getElementById('config-display');
            container.innerHTML = '<div class="loading">Loading configuration...</div>';

            const config = await this.apiCall('/config');

            container.innerHTML = `
                <div class="config-section">
                    <h5>Service Limits</h5>
                    <div class="config-item">
                        <label>Max Payload:</label>
                        <span>${this.formatBytes(config.limits?.max_payload_bytes || 0)}</span>
                    </div>
                    <div class="config-item">
                        <label>Max Events per Request:</label>
                        <span>${config.limits?.max_events_per_post || 0}</span>
                    </div>
                </div>
            `;

        } catch (error) {
            document.getElementById('config-display').innerHTML = 
                '<div class="error-state">Failed to load configuration</div>';
        }
    }

    async triggerMaintenance() {
        try {
            if (!this.adminToken) {
                await this.promptForAdminToken();
            }

            await this.apiCall('/admin/maintenance', {
                method: 'POST'
            });

            this.showToast('Maintenance triggered successfully', 'success');
            await this.loadMaintenanceStatus();

        } catch (error) {
            this.showToast('Failed to trigger maintenance: ' + error.message, 'error');
        }
    }

    async triggerPurge() {
        if (!confirm('This will permanently delete old logs based on project retention settings. Continue?')) {
            return;
        }

        try {
            if (!this.adminToken) {
                await this.promptForAdminToken();
            }

            const response = await this.apiCall('/admin/purge', {
                method: 'POST'
            });

            this.showToast(`Purge completed. Deleted ${response.deletedLogs || 0} logs.`, 'success');
            await this.loadMaintenanceStatus();

        } catch (error) {
            this.showToast('Failed to trigger purge: ' + error.message, 'error');
        }
    }

    async clearConfigCache() {
        try {
            await this.apiCall('/config/cache', {
                method: 'DELETE'
            });

            this.showToast('Configuration cache cleared', 'success');
            await this.loadServiceConfig();

        } catch (error) {
            this.showToast('Failed to clear cache: ' + error.message, 'error');
        }
    }

    async loadRecentLogs() {
        try {
            if (!this.adminToken) {
                await this.promptForAdminToken();
            }

            const response = await this.apiCall('/admin/logs/recent?limit=20');
            
            const container = document.getElementById('logs-debug-section');
            if (!response.logs || response.logs.length === 0) {
                container.innerHTML = '<div class="no-data">No logs found in database</div>';
                return;
            }

            let html = `
                <div style="margin-bottom: 1rem;">
                    <strong>Found ${response.count} recent log(s)</strong>
                </div>
                <div style="max-height: 400px; overflow-y: auto;">
                    <table style="width: 100%; border-collapse: collapse; font-size: 0.85rem;">
                        <thead>
                            <tr style="background: #f5f5f5; border-bottom: 2px solid #ddd;">
                                <th style="padding: 8px; text-align: left;">Time</th>
                                <th style="padding: 8px; text-align: left;">Project</th>
                                <th style="padding: 8px; text-align: left;">Level</th>
                                <th style="padding: 8px; text-align: left;">Source</th>
                                <th style="padding: 8px; text-align: left;">Message</th>
                            </tr>
                        </thead>
                        <tbody>
            `;

            response.logs.forEach(log => {
                const time = new Date(log.created_at).toLocaleString();
                const levelColor = {
                    'error': '#ef4444',
                    'warn': '#f59e0b',
                    'info': '#3b82f6',
                    'fatal': '#991b1b'
                }[log.level] || '#6b7280';

                html += `
                    <tr style="border-bottom: 1px solid #e5e5e5;">
                        <td style="padding: 8px; white-space: nowrap;">${time}</td>
                        <td style="padding: 8px;">${log.project_slug || log.project_id}</td>
                        <td style="padding: 8px;">
                            <span style="color: ${levelColor}; font-weight: 600;">${log.level.toUpperCase()}</span>
                        </td>
                        <td style="padding: 8px;">${log.source || '-'}</td>
                        <td style="padding: 8px; max-width: 400px; overflow: hidden; text-overflow: ellipsis;">${log.message}</td>
                    </tr>
                `;
            });

            html += '</tbody></table></div>';
            container.innerHTML = html;

        } catch (error) {
            const container = document.getElementById('logs-debug-section');
            container.innerHTML = `<div class="error">Failed to load logs: ${error.message}</div>`;
            this.showToast('Failed to load recent logs: ' + error.message, 'error');
        }
    }

    // ===== UTILITY METHODS =====
    formatNumber(num) {
        return new Intl.NumberFormat().format(num);
    }

    formatBytes(bytes) {
        const sizes = ['Bytes', 'KB', 'MB', 'GB'];
        if (bytes === 0) return '0 Bytes';
        const i = Math.floor(Math.log(bytes) / Math.log(1024));
        return Math.round(bytes / Math.pow(1024, i) * 100) / 100 + ' ' + sizes[i];
    }

    formatRelativeTime(date) {
        const now = new Date();
        const diff = now - date;
        const seconds = Math.floor(diff / 1000);
        const minutes = Math.floor(seconds / 60);
        const hours = Math.floor(minutes / 60);
        const days = Math.floor(hours / 24);

        if (days > 0) return `${days}d ago`;
        if (hours > 0) return `${hours}h ago`;
        if (minutes > 0) return `${minutes}m ago`;
        return `${seconds}s ago`;
    }

    escapeHtml(text) {
        const div = document.createElement('div');
        div.textContent = text;
        return div.innerHTML;
    }

    showToast(message, type = 'info') {
        const container = document.getElementById('toast-container');
        if (container) {
            const toast = document.createElement('div');
            toast.className = `toast toast-${type}`;
            toast.innerHTML = `
                <span class="toast-message">${this.escapeHtml(message)}</span>
                <button class="toast-close" onclick="this.parentElement.remove()">&times;</button>
            `;

            container.appendChild(toast);

            // Auto-remove after 5 seconds
            setTimeout(() => {
                if (toast.parentElement) {
                    toast.remove();
                }
            }, 5000);
        }
    }

    // ===== TESTING FUNCTIONALITY =====
    async loadTesting() {
        try {
            // Load testing configuration from environment
            const testingConfigResponse = await this.apiCall('/admin/testing/config');
            this.testingConfig = testingConfigResponse.services;

            // Display service status
            this.displayServiceStatus();
            
            // Populate service checkboxes
            this.populateServiceCheckboxes();

            console.log('Testing configuration loaded:', this.testingConfig);
        } catch (error) {
            console.error('Failed to load testing data:', error);
            this.showToast('Failed to load testing configuration', 'error');
        }
    }

    populateServiceCheckboxes() {
        const container = document.getElementById('service-checkboxes');
        if (!container) return;

        const services = [
            {
                id: 'tekno-enabled',
                name: '📋 Tekno Logger',
                enabled: this.testingConfig.teknoLogger.hasTestProject,
                checked: this.testingConfig.teknoLogger.hasTestProject
            },
            {
                id: 'sentry-enabled',
                name: '🔍 Sentry',
                enabled: this.testingConfig.sentry.enabled,
                checked: this.testingConfig.sentry.enabled
            },
            {
                id: 'betterstack-enabled',
                name: '📈 BetterStack',
                enabled: this.testingConfig.betterstack.enabled,
                checked: this.testingConfig.betterstack.enabled
            }
        ];

        container.innerHTML = services.map(service => `
            <div class="service-checkbox ${service.enabled ? 'enabled' : 'disabled'}">
                <input 
                    type="checkbox" 
                    id="${service.id}" 
                    ${service.checked ? 'checked' : ''} 
                    ${!service.enabled ? 'disabled' : ''}
                >
                <label for="${service.id}">${service.name}</label>
            </div>
        `).join('');
    }

    selectAllServices(selectAll) {
        const checkboxes = document.querySelectorAll('#service-checkboxes input[type="checkbox"]:not([disabled])');
        checkboxes.forEach(checkbox => {
            checkbox.checked = selectAll;
        });
    }

    displayServiceStatus() {
        const container = document.getElementById('service-status-grid');
        
        const services = [
            {
                name: '📋 Tekno Logger',
                status: this.testingConfig.teknoLogger.hasTestProject,
                description: this.testingConfig.teknoLogger.hasTestProject ? 
                    `Configured via TEST_TEKNO_PROJECT_SLUG and TEST_TEKNO_API_KEY${this.testingConfig.teknoLogger.projectSlug ? ` (Project: ${this.testingConfig.teknoLogger.projectSlug})` : ''}` : 
                    'Set TEST_TEKNO_PROJECT_SLUG and TEST_TEKNO_API_KEY environment variables'
            },
            {
                name: '🔍 Sentry',
                status: this.testingConfig.sentry.enabled,
                description: this.testingConfig.sentry.enabled ? 'Configured via TEST_SENTRY_DSN' : 'Set TEST_SENTRY_DSN environment variable'
            },
            {
                name: '📈 BetterStack',
                status: this.testingConfig.betterstack.enabled,
                description: this.testingConfig.betterstack.enabled ? 'Configured via TEST_BETTERSTACK_TOKEN' : 'Set TEST_BETTERSTACK_TOKEN environment variable'
            }
        ];

        container.innerHTML = services.map(service => `
            <div class="service-status-card ${service.status ? 'enabled' : 'disabled'}">
                <div class="service-header">
                    <h5>${service.name}</h5>
                    <span class="status-badge ${service.status ? 'enabled' : 'disabled'}">
                        ${service.status ? '✅ Enabled' : '❌ Disabled'}
                    </span>
                </div>
                <p class="service-description">${service.description}</p>
            </div>
        `).join('');
    }

    loadScenario(scenario) {
        const scenarios = {
            info: {
                level: 'info',
                message: 'User successfully logged in',
                context: '{\n  "user_id": "user_123",\n  "session_id": "sess_abc",\n  "ip_address": "192.168.1.100"\n}'
            },
            warning: {
                level: 'warn',
                message: 'High memory usage detected',
                context: '{\n  "memory_usage": "85%",\n  "threshold": "80%",\n  "process": "web-server"\n}'
            },
            error: {
                level: 'error',
                message: 'Database connection failed',
                context: '{\n  "error_code": "ECONNREFUSED",\n  "host": "localhost",\n  "port": 5432,\n  "retry_count": 3\n}'
            },
            exception: {
                level: 'fatal',
                message: 'Unhandled exception in payment processing',
                context: '{\n  "exception": "NullPointerException",\n  "stack_trace": "at PaymentProcessor.process(PaymentProcessor.java:42)",\n  "transaction_id": "txn_xyz789"\n}'
            },
            performance: {
                level: 'warn',
                message: 'Slow API response detected',
                context: '{\n  "endpoint": "/api/users",\n  "response_time": 2500,\n  "threshold": 1000,\n  "method": "GET"\n}'
            }
        };

        const scenarioData = scenarios[scenario];
        if (scenarioData) {
            document.getElementById('test-level').value = scenarioData.level;
            document.getElementById('test-message').value = scenarioData.message;
            document.getElementById('test-context').value = scenarioData.context;
        }
    }

    async sendTestLog() {
        const logData = {
            level: document.getElementById('test-level').value,
            source: document.getElementById('test-source').value,
            env: document.getElementById('test-env').value,
            message: document.getElementById('test-message').value,
            ctx: this.parseJsonSafely(document.getElementById('test-context').value)
        };

        const results = [];
        
        // Send to selected services based on checkboxes
        if (document.getElementById('tekno-enabled')?.checked && this.testingConfig.teknoLogger.hasTestProject) {
            results.push(await this.sendToTeknoLogger(logData));
        }
        
        if (document.getElementById('sentry-enabled')?.checked && this.testingConfig.sentry.enabled) {
            results.push(await this.sendToSentry(logData));
        }
        
        if (document.getElementById('betterstack-enabled')?.checked && this.testingConfig.betterstack.enabled) {
            results.push(await this.sendToBetterStack(logData));
        }

        if (results.length === 0) {
            this.showToast('Please select at least one service to test', 'warning');
            return;
        }

        this.displayTestResults(results, 1);
    }

    async sendBatchLogs() {
        const baseLog = {
            level: document.getElementById('test-level').value,
            source: document.getElementById('test-source').value,
            env: document.getElementById('test-env').value,
            message: document.getElementById('test-message').value,
            ctx: this.parseJsonSafely(document.getElementById('test-context').value)
        };

        const results = [];
        const batchSize = 10;
        
        for (let i = 0; i < batchSize; i++) {
            const logData = {
                ...baseLog,
                message: `${baseLog.message} (batch ${i + 1}/${batchSize})`,
                ctx: { ...baseLog.ctx, batch_id: i + 1 }
            };

            if (document.getElementById('tekno-enabled')?.checked && this.testingConfig.teknoLogger.hasTestProject) {
                results.push(await this.sendToTeknoLogger(logData));
            }
            
            if (document.getElementById('sentry-enabled')?.checked && this.testingConfig.sentry.enabled) {
                results.push(await this.sendToSentry(logData));
            }
            
            if (document.getElementById('betterstack-enabled')?.checked && this.testingConfig.betterstack.enabled) {
                results.push(await this.sendToBetterStack(logData));
            }

            // Small delay between requests
            await new Promise(resolve => setTimeout(resolve, 100));
        }

        if (results.length === 0) {
            this.showToast('Please select at least one service to test', 'warning');
            return;
        }

        this.displayTestResults(results, batchSize);
    }

    async sendToTeknoLogger(logData) {
        const startTime = Date.now();
        
        if (!this.testingConfig.teknoLogger.hasTestProject) {
            return {
                service: 'Tekno Logger',
                success: false,
                error: 'Test project not configured (TEST_TEKNO_PROJECT_SLUG and TEST_TEKNO_API_KEY environment variables not set)',
                responseTime: 0
            };
        }

        try {
            // Get Tekno Logger testing credentials
            const credentialsResponse = await this.apiCall('/admin/testing/tekno-credentials');
            
            if (!credentialsResponse.success) {
                throw new Error(credentialsResponse.message || 'Failed to get testing credentials');
            }

            const { projectSlug, apiKey, hmacSecret } = credentialsResponse;

            // Prepare the log payload
            const payload = {
                events: [logData]
            };
            const payloadString = JSON.stringify(payload);

            // Generate HMAC signature
            const hmacSignature = await this.generateHMACSignature(payloadString, hmacSecret);

            // Send log to Tekno Logger using proper authentication
            const response = await fetch('/api/log', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'X-Project-Key': apiKey,
                    'X-Signature': hmacSignature
                },
                body: payloadString
            });

            const responseText = await response.text();
            let responseData;
            try {
                responseData = JSON.parse(responseText);
            } catch {
                responseData = { message: responseText };
            }

            return {
                service: 'Tekno Logger',
                success: response.ok,
                status: response.status,
                responseTime: Date.now() - startTime,
                error: response.ok ? null : `HTTP ${response.status}: ${responseData.error || responseText}`,
                response: response.ok ? responseData : null
            };
        } catch (error) {
            let errorMessage = error.message;
            
            // Provide helpful error messages for common issues
            if (error.message.includes('testing credentials not configured')) {
                errorMessage = 'Environment variables not configured. Set TEST_TEKNO_PROJECT_SLUG and TEST_TEKNO_API_KEY on your server.';
            } else if (error.message.includes('502') || error.message.includes('Bad Gateway')) {
                errorMessage = 'Server error - likely missing environment variables. Check Render dashboard settings.';
            }
            
            return {
                service: 'Tekno Logger',
                success: false,
                error: errorMessage,
                responseTime: Date.now() - startTime
            };
        }
    }

    // Helper method to generate HMAC signature
    async generateHMACSignature(message, secret) {
        const encoder = new TextEncoder();
        const key = await crypto.subtle.importKey(
            'raw',
            encoder.encode(secret),
            { name: 'HMAC', hash: 'SHA-256' },
            false,
            ['sign']
        );
        
        const signature = await crypto.subtle.sign('HMAC', key, encoder.encode(message));
        return Array.from(new Uint8Array(signature))
            .map(b => b.toString(16).padStart(2, '0'))
            .join('');
    }

    async sendToSentry(logData) {
        const startTime = Date.now();
        
        if (!this.testingConfig.sentry.enabled) {
            return {
                service: 'Sentry',
                success: false,
                error: 'Sentry is not configured (TEST_SENTRY_DSN environment variable not set)',
                responseTime: 0
            };
        }

        try {
            // Use server-side forwarding to avoid exposing DSN
            const result = await this.apiCall('/admin/testing/forward', {
                method: 'POST',
                body: JSON.stringify({
                    service: 'sentry',
                    logData: logData
                })
            });

            return result;
        } catch (error) {
            return {
                service: 'Sentry',
                success: false,
                error: error.message,
                responseTime: Date.now() - startTime
            };
        }
    }

    async sendToBetterStack(logData) {
        const startTime = Date.now();
        
        if (!this.testingConfig.betterstack.enabled) {
            return {
                service: 'BetterStack',
                success: false,
                error: 'BetterStack is not configured (TEST_BETTERSTACK_TOKEN environment variable not set)',
                responseTime: 0
            };
        }

        try {
            // Use server-side forwarding to avoid exposing token
            const result = await this.apiCall('/admin/testing/forward', {
                method: 'POST',
                body: JSON.stringify({
                    service: 'betterstack',
                    logData: logData
                })
            });

            return result;
        } catch (error) {
            return {
                service: 'BetterStack',
                success: false,
                error: error.message,
                responseTime: Date.now() - startTime
            };
        }
    }

    displayTestResults(results, logCount) {
        const container = document.getElementById('test-results');
        const timestamp = new Date().toLocaleTimeString();
        
        const resultHtml = `
            <div class="test-result">
                <div class="result-header">
                    <h5>Test Results - ${timestamp}</h5>
                    <span class="log-count">${logCount} log${logCount > 1 ? 's' : ''} sent</span>
                </div>
                <div class="service-results">
                    ${results.map(result => `
                        <div class="service-result ${result.success ? 'success' : 'error'}">
                            <div class="service-name">${result.service}</div>
                            <div class="service-status">
                                ${result.success ? 
                                    `✅ Success (${result.responseTime}ms)` : 
                                    `❌ Failed: ${result.error}`
                                }
                            </div>
                        </div>
                    `).join('')}
                </div>
            </div>
        `;

        if (container.querySelector('.results-placeholder')) {
            container.innerHTML = resultHtml;
        } else {
            container.insertAdjacentHTML('afterbegin', resultHtml);
        }

        // Keep only last 10 results
        const results_divs = container.querySelectorAll('.test-result');
        if (results_divs.length > 10) {
            for (let i = 10; i < results_divs.length; i++) {
                results_divs[i].remove();
            }
        }
    }

    parseJsonSafely(jsonString) {
        try {
            return JSON.parse(jsonString || '{}');
        } catch (error) {
            return { parse_error: 'Invalid JSON', original: jsonString };
        }
    }

    generateUUID() {
        return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function(c) {
            const r = Math.random() * 16 | 0;
            const v = c == 'x' ? r : (r & 0x3 | 0x8);
            return v.toString(16);
        });
    }
}

// Initialize the dashboard when the page loads
document.addEventListener('DOMContentLoaded', () => {
    console.log('🌐 DOM Content Loaded - Starting TeknoLogger...');
    window.logger = new TeknoLogger();
});