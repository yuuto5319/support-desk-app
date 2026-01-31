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

    let desks = [...State.getDesks()];
    const statuses = State.getStatuses();
    const settings = State.getSettings();

    // ローカル設定を取得（各ユーザーのブラウザに保存）
    const localSettings = this.getLocalSettings();

    // グリッドの列数を取得（レスポンシブ対応）
    const colCount = this.getGridColumns();

    // 左右反転: 各行内でデスクの順序を逆にする
    if (localSettings.flipHorizontal) {
      const flippedDesks = [];
      for (let i = 0; i < desks.length; i += colCount) {
        const row = desks.slice(i, i + colCount);
        flippedDesks.push(...row.reverse());
      }
      desks = flippedDesks;
    }

    // 上下反転: 行の順序を逆にする
    if (localSettings.flipVertical) {
      const flippedDesks = [];
      for (let i = desks.length - colCount; i >= 0; i -= colCount) {
        for (let j = 0; j < colCount && i + j < desks.length; j++) {
          flippedDesks.push(desks[i + j]);
        }
      }
      desks = flippedDesks;
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
   * Get local settings (user-specific, stored in localStorage)
   */
  getLocalSettings() {
    const saved = localStorage.getItem('support-desk-local-settings');
    if (saved) {
      try {
        return JSON.parse(saved);
      } catch (e) {
        // ignore
      }
    }
    return {
      flipVertical: false,
      flipHorizontal: false
    };
  },

  /**
   * Save local settings
   */
  saveLocalSettings(settings) {
    localStorage.setItem('support-desk-local-settings', JSON.stringify(settings));
    this.render();
  },

  /**
   * Get current grid column count based on screen size
   */
  getGridColumns() {
    const width = window.innerWidth;
    const isPortrait = window.matchMedia('(orientation: portrait)').matches;

    if (width <= 768 && isPortrait) {
      return 2; // スマホ縦画面: 2列
    } else if (width <= 1024) {
      return 3; // タブレット: 3列
    } else if (width <= 1200) {
      return 4; // 小さめPC: 4列
    }
    return 6; // デスクトップ: 6列
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
