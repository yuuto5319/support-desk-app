/**
 * Support Desk App - Utility Functions
 */

const Utils = {
  /**
   * Generate a unique ID
   */
  generateId() {
    return Date.now().toString(36) + Math.random().toString(36).substr(2);
  },

  /**
   * Format time duration from milliseconds
   */
  formatDuration(ms) {
    const seconds = Math.floor(ms / 1000);
    const minutes = Math.floor(seconds / 60);
    const hours = Math.floor(minutes / 60);

    if (hours > 0) {
      return `${hours}時間${minutes % 60}分`;
    } else if (minutes > 0) {
      return `${minutes}分${seconds % 60}秒`;
    } else {
      return `${seconds}秒`;
    }
  },

  /**
   * Format timestamp to readable string
   */
  formatTime(timestamp) {
    const date = new Date(timestamp);
    return date.toLocaleTimeString('ja-JP', {
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit'
    });
  },

  /**
   * Format timestamp to date string
   */
  formatDate(timestamp) {
    const date = new Date(timestamp);
    return date.toLocaleDateString('ja-JP', {
      year: 'numeric',
      month: '2-digit',
      day: '2-digit'
    });
  },

  /**
   * Format timestamp to datetime string
   */
  formatDateTime(timestamp) {
    return `${this.formatDate(timestamp)} ${this.formatTime(timestamp)}`;
  },

  /**
   * Get initials from name
   */
  getInitials(name) {
    if (!name) return '?';
    const parts = name.split(/[\s　]+/);
    if (parts.length >= 2) {
      return (parts[0][0] + parts[1][0]).toUpperCase();
    }
    return name.slice(0, 2).toUpperCase();
  },

  /**
   * Request notification permission
   */
  async requestNotificationPermission() {
    if (!('Notification' in window)) {
      console.log('This browser does not support notifications');
      return false;
    }

    if (Notification.permission === 'granted') {
      return true;
    }

    if (Notification.permission !== 'denied') {
      const permission = await Notification.requestPermission();
      return permission === 'granted';
    }

    return false;
  },

  /**
   * Send desktop notification
   */
  sendNotification(title, body, icon = '📞') {
    if (Notification.permission === 'granted') {
      new Notification(title, {
        body,
        icon: `data:image/svg+xml,<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 100 100'><text y='.9em' font-size='90'>${icon}</text></svg>`,
        tag: 'support-desk-notification'
      });
    }
  },

  /**
   * Convert data to CSV
   */
  toCSV(data, headers) {
    const headerRow = headers.map(h => `"${h.label}"`).join(',');
    const rows = data.map(row => {
      return headers.map(h => {
        const value = row[h.key];
        if (typeof value === 'string') {
          return `"${value.replace(/"/g, '""')}"`;
        }
        return value;
      }).join(',');
    });
    return [headerRow, ...rows].join('\n');
  },

  /**
   * Download CSV file
   */
  downloadCSV(filename, csvContent) {
    const BOM = '\uFEFF';
    const blob = new Blob([BOM + csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = filename;
    link.click();
    URL.revokeObjectURL(url);
  },

  /**
   * Debounce function
   */
  debounce(func, wait) {
    let timeout;
    return function executedFunction(...args) {
      const later = () => {
        clearTimeout(timeout);
        func(...args);
      };
      clearTimeout(timeout);
      timeout = setTimeout(later, wait);
    };
  },

  /**
   * Deep clone object
   */
  deepClone(obj) {
    return JSON.parse(JSON.stringify(obj));
  },

  /**
   * Get today's date string
   */
  getTodayString() {
    const today = new Date();
    return today.toISOString().split('T')[0];
  },

  /**
   * Get week start date string
   */
  getWeekStartString() {
    const today = new Date();
    const day = today.getDay();
    const diff = today.getDate() - day + (day === 0 ? -6 : 1);
    const weekStart = new Date(today.setDate(diff));
    return weekStart.toISOString().split('T')[0];
  },

  /**
   * Get month start date string
   */
  getMonthStartString() {
    const today = new Date();
    return new Date(today.getFullYear(), today.getMonth(), 1).toISOString().split('T')[0];
  },

  /**
   * Truncate string
   */
  truncate(str, length) {
    if (!str) return '';
    if (str.length <= length) return str;
    return str.slice(0, length) + '...';
  }
};

// Export for use in other modules
window.Utils = Utils;
