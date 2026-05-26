class HistoryManager {
  constructor(limit = 100) {
    this.limit = limit;
    this.stack = [];
    this.index = -1;
  }

  push(state, label = 'Change') {
    const entry = {
      label,
      at: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
      state: JSON.stringify(state)
    };
    this.stack = this.stack.slice(0, this.index + 1);
    this.stack.push(entry);
    if (this.stack.length > this.limit) this.stack.shift();
    this.index = this.stack.length - 1;
  }

  canUndo() { return this.index > 0; }
  canRedo() { return this.index < this.stack.length - 1; }

  undo() {
    if (!this.canUndo()) return null;
    this.index -= 1;
    return JSON.parse(this.stack[this.index].state);
  }

  redo() {
    if (!this.canRedo()) return null;
    this.index += 1;
    return JSON.parse(this.stack[this.index].state);
  }

  clear(state) {
    this.stack = [];
    this.index = -1;
    this.push(state, 'History Cleared');
  }

  list() {
    return this.stack.map((entry, idx) => ({ ...entry, active: idx === this.index })).reverse();
  }
}
window.HistoryManager = HistoryManager;
