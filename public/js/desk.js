/**
 * Support Desk App - Desk Module
 * Handles desk card rendering and status management
 */

const Desk = {
    /**
     * Initialize desk functionality
     */
    init() {
        this.render();

        // Listen for state changes
        State.addListener(() => this.render());
    },

    /**
     * Render all desk cards
     */
    render() {
        const grid = document.getElementById('deskGrid');
        if (!grid) return;

        const desks = State.getDesks();
        const statuses = State.getStatuses();
        const settings = State.getSettings();

        // Update grid flip classes
        grid.classList.remove('flip-vertical', 'flip-horizontal', 'flip-both');
        if (settings.flipVertical && settings.flipHorizontal) {
            grid.classList.add('flip-both');
        } else if (settings.flipVertical) {
            grid.classList.add('flip-vertical');
        } else if (settings.flipHorizontal) {
            grid.classList.add('flip-horizontal');
        }

        // Render desk cards
        grid.innerHTML = desks.map(desk => this.renderCard(desk, statuses)).join('');

        // Setup event handlers for each desk
        desks.forEach(desk => {
            this.setupCardHandlers(desk.id);
            Memo.setupMemoHandlers(desk.id);
        });
    },

    /**
     * Render a single desk card
     */
    renderCard(desk, statuses) {
        const currentStatus = statuses.find(s => s.id === desk.status) || statuses[0];
        const statusDuration = Date.now() - desk.statusStartTime;

        return `
      <div class="desk-card status-${desk.status}" data-desk-id="${desk.id}">
        <div class="desk-header">
          <span class="desk-number">DESK ${desk.number}</span>
          <span class="call-count">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72"/>
            </svg>
            ${desk.callCount || 0}
          </span>
        </div>
        
        <div class="operator-info">
          <div class="operator-avatar">${Utils.getInitials(desk.operatorName)}</div>
          <div class="operator-name">${desk.operatorName}</div>
          <div class="status-badge" style="background-color: ${currentStatus.color}">
            <span class="pulse"></span>
            ${currentStatus.name}
          </div>
          <div class="status-time">${Utils.formatDuration(statusDuration)}</div>
        </div>
        
        <div class="status-selector">
          ${statuses.map(status => `
            <button class="status-option ${desk.status === status.id ? 'active' : ''}" 
                    data-status="${status.id}"
                    data-desk-id="${desk.id}">
              <span class="dot" style="background-color: ${status.color}"></span>
              ${status.name}
            </button>
          `).join('')}
        </div>
        
        ${Memo.renderMemoSection(desk)}
      </div>
    `;
    },

    /**
     * Setup event handlers for a desk card
     */
    setupCardHandlers(deskId) {
        const statusButtons = document.querySelectorAll(`.status-option[data-desk-id="${deskId}"]`);

        statusButtons.forEach(button => {
            button.addEventListener('click', () => {
                const status = button.dataset.status;
                this.changeStatus(deskId, status);
            });
        });
    },

    /**
     * Change desk status
     */
    changeStatus(deskId, newStatus) {
        State.updateDesk(deskId, { status: newStatus });
    },

    /**
     * Update status time display (called by interval)
     */
    updateStatusTimes() {
        const desks = State.getDesks();

        desks.forEach(desk => {
            const card = document.querySelector(`.desk-card[data-desk-id="${desk.id}"]`);
            if (card) {
                const timeElement = card.querySelector('.status-time');
                if (timeElement) {
                    const duration = Date.now() - desk.statusStartTime;
                    timeElement.textContent = Utils.formatDuration(duration);
                }
            }
        });
    }
};

// Export for use in other modules
window.Desk = Desk;
