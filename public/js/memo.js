/**
 * Support Desk App - Memo Module
 * Handles memo input, display, history, and notifications
 */

const Memo = {
    currentHistoryDeskId: null,

    /**
     * Initialize memo functionality
     */
    init() {
        this.setupModalHandlers();
    },

    /**
     * Setup modal event handlers
     */
    setupModalHandlers() {
        const modal = document.getElementById('memoHistoryModal');
        const closeBtn = document.getElementById('closeMemoHistory');

        if (closeBtn) {
            closeBtn.addEventListener('click', () => this.closeHistoryModal());
        }

        if (modal) {
            modal.addEventListener('click', (e) => {
                if (e.target === modal) {
                    this.closeHistoryModal();
                }
            });
        }
    },

    /**
     * Render memo section for a desk card
     */
    renderMemoSection(desk) {
        return `
      <div class="memo-section">
        <div class="memo-input-wrapper">
          <input type="text" 
                 class="memo-input" 
                 placeholder="メモを入力..." 
                 data-desk-id="${desk.id}"
                 value=""
          />
          <button class="memo-send-btn" data-desk-id="${desk.id}" title="メモを送信">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <line x1="22" y1="2" x2="11" y2="13"/>
              <polygon points="22,2 15,22 11,13 2,9"/>
            </svg>
          </button>
        </div>
        <div class="memo-display" id="memo-display-${desk.id}">${desk.memo || ''}</div>
        <button class="memo-history-btn" data-desk-id="${desk.id}">履歴を表示</button>
      </div>
    `;
    },

    /**
     * Setup memo input handlers for a desk
     */
    setupMemoHandlers(deskId) {
        const input = document.querySelector(`.memo-input[data-desk-id="${deskId}"]`);
        const sendBtn = document.querySelector(`.memo-send-btn[data-desk-id="${deskId}"]`);
        const historyBtn = document.querySelector(`.memo-history-btn[data-desk-id="${deskId}"]`);

        if (input && sendBtn) {
            // Send on button click
            sendBtn.addEventListener('click', () => this.sendMemo(deskId, input));

            // Send on Enter key
            input.addEventListener('keypress', (e) => {
                if (e.key === 'Enter') {
                    this.sendMemo(deskId, input);
                }
            });
        }

        if (historyBtn) {
            historyBtn.addEventListener('click', () => this.openHistoryModal(deskId));
        }
    },

    /**
     * Send memo for a desk
     */
    sendMemo(deskId, input) {
        const memo = input.value.trim();
        if (!memo) return;

        const desk = State.getDesk(deskId);
        const settings = State.getSettings();

        // Update desk memo via API/Socket
        State.updateMemo(deskId, memo);

        // Update display
        const display = document.getElementById(`memo-display-${deskId}`);
        if (display) {
            display.textContent = memo;
        }

        // Clear input
        input.value = '';

        // Send notification (local only - server will handle broadcast)
        if (settings.enableNotifications) {
            Utils.sendNotification(
                `${desk?.operatorName || 'デスク'} へのメモ`,
                memo,
                '📝'
            );
        }
    },

    /**
     * Refresh memo display
     */
    refreshMemoDisplay(deskId) {
        const desk = State.getDesk(deskId);
        const display = document.getElementById(`memo-display-${deskId}`);
        if (display && desk) {
            display.textContent = desk.memo || '';
        }
    },

    /**
     * Open memo history modal
     */
    async openHistoryModal(deskId) {
        this.currentHistoryDeskId = deskId;
        const modal = document.getElementById('memoHistoryModal');
        const list = document.getElementById('memoHistoryList');
        const desk = State.getDesk(deskId);

        // Fetch history from server
        const history = await State.getMemoHistory(deskId);

        // Update modal title
        const title = modal.querySelector('.modal-title');
        if (title) {
            title.textContent = `${desk?.operatorName || 'デスク'} - メモ履歴`;
        }

        // Render history list
        if (history.length === 0) {
            list.innerHTML = '<p class="text-center text-muted">履歴がありません</p>';
        } else {
            list.innerHTML = history.map(item => `
        <div class="memo-history-item">
          <div class="memo-history-time">${Utils.formatDateTime(item.timestamp)}</div>
          <div class="memo-history-content">${this.escapeHtml(item.content)}</div>
        </div>
      `).join('');
        }

        // Show modal
        modal.classList.add('active');
    },

    /**
     * Close memo history modal
     */
    closeHistoryModal() {
        const modal = document.getElementById('memoHistoryModal');
        modal.classList.remove('active');
        this.currentHistoryDeskId = null;
    },

    /**
     * Escape HTML to prevent XSS
     */
    escapeHtml(text) {
        const div = document.createElement('div');
        div.textContent = text;
        return div.innerHTML;
    }
};

// Export for use in other modules
window.Memo = Memo;
