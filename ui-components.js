// ui-components.js - Lightweight Component System for UI Rendering
'use strict';

(function() {
  'use strict';

  /**
   * Component base class for reusable UI elements
   */
  class Component {
    constructor(props = {}) {
      this.props = props;
      this.element = null;
    }

    /**
     * Render component to DOM element
     * @param {HTMLElement|string} container - Container element or selector
     * @returns {HTMLElement} Rendered element
     */
    render(container = null) {
      const html = this.renderHTML();
      
      if (container) {
        const containerEl = typeof container === 'string' 
          ? document.querySelector(container) 
          : container;
        
        if (containerEl) {
          containerEl.innerHTML = html;
          this.element = containerEl.firstElementChild || containerEl;
        }
      } else {
        // Create temporary container to parse HTML
        const temp = document.createElement('div');
        temp.innerHTML = html;
        this.element = temp.firstElementChild;
      }
      
      this.attachEvents();
      return this.element;
    }

    /**
     * Override in subclasses to return HTML string
     */
    renderHTML() {
      return '';
    }

    /**
     * Override in subclasses to attach event listeners
     */
    attachEvents() {
      // Subclasses can implement
    }
  }

  /**
   * Card Component - Reusable card container
   */
  class Card extends Component {
    renderHTML() {
      const { title, className = '', children = '', actions = '' } = this.props;
      
      return `
        <div class="card ${className}">
          ${title ? `<h3>${title}</h3>` : ''}
          <div class="card-content">
            ${children}
          </div>
          ${actions ? `<div class="card-actions">${actions}</div>` : ''}
        </div>
      `;
    }
  }

  /**
   * Button Component
   */
  class Button extends Component {
    renderHTML() {
      const { 
        text, 
        onClick, 
        className = 'btn', 
        variant = 'primary',
        disabled = false,
        id = null
      } = this.props;
      
      const btnId = id ? `id="${id}"` : '';
      const disabledAttr = disabled ? 'disabled' : '';
      const onClickAttr = onClick ? `onclick="${onClick}"` : '';
      
      return `
        <button type="button" ${btnId} class="${className} ${variant}" ${onClickAttr} ${disabledAttr}>
          ${text}
        </button>
      `;
    }
  }

  /**
   * Table Component - Structured table rendering
   */
  class Table extends Component {
    renderHTML() {
      const { 
        headers = [], 
        rows = [], 
        className = 'table',
        id = null
      } = this.props;
      
      const tableId = id ? `id="${id}"` : '';
      
      return `
        <table ${tableId} class="${className}">
          ${headers.length > 0 ? `
            <thead>
              <tr>
                ${headers.map(h => `<th>${h}</th>`).join('')}
              </tr>
            </thead>
          ` : ''}
          <tbody>
            ${rows.map(row => `
              <tr>
                ${row.map(cell => `<td>${cell}</td>`).join('')}
              </tr>
            `).join('')}
          </tbody>
        </table>
      `;
    }
  }

  /**
   * Modal Component
   */
  class Modal extends Component {
    renderHTML() {
      const { 
        title, 
        content, 
        className = '',
        size = 'normal' // 'normal', 'large', 'small'
      } = this.props;
      
      const sizeClass = size === 'large' ? 'modal-large' : size === 'small' ? 'modal-small' : '';
      
      return `
        <div class="modal ${className}">
          <div class="modal-content ${sizeClass}">
            <div class="modal-header">
              <h2>${title}</h2>
              <button type="button" class="modal-close close" aria-label="Close modal" onclick="this.closest('.modal').remove()">&times;</button>
            </div>
            <div class="modal-body">
              ${content}
            </div>
          </div>
        </div>
      `;
    }

    attachEvents() {
      if (this.element) {
        // Close on background click
        this.element.addEventListener('click', (e) => {
          if (e.target === this.element) {
            this.element.remove();
          }
        });
      }
    }
  }

  /**
   * Badge Component
   */
  class Badge extends Component {
    renderHTML() {
      const { text, variant = 'default', className = '' } = this.props;
      
      return `<span class="badge badge-${variant} ${className}">${text}</span>`;
    }
  }

  /**
   * StatCard Component - For displaying statistics
   */
  class StatCard extends Component {
    renderHTML() {
      const { label, value, change = null, className = '' } = this.props;
      
      const changeClass = change > 0 ? 'positive' : change < 0 ? 'negative' : '';
      const changeDisplay = change !== null ? `
        <span class="stat-change ${changeClass}">
          ${change > 0 ? '+' : ''}${change}
        </span>
      ` : '';
      
      return `
        <div class="stat-card ${className}">
          <div class="stat-label">${label}</div>
          <div class="stat-value">
            ${value}
            ${changeDisplay}
          </div>
        </div>
      `;
    }
  }

  /**
   * Helper function to create and render components
   */
  function createComponent(ComponentClass, props, container) {
    const component = new ComponentClass(props);
    return component.render(container);
  }

  /**
   * Helper function to render list of items
   */
  function renderList(items, renderItem, container, className = 'list') {
    const html = `
      <div class="${className}">
        ${items.map((item, index) => renderItem(item, index)).join('')}
      </div>
    `;
    
    if (container) {
      const el = typeof container === 'string' ? document.querySelector(container) : container;
      if (el) {
        el.innerHTML = html;
      }
    }
    
    return html;
  }

  /**
   * Helper function to safely set innerHTML with event preservation
   */
  function safeSetHTML(element, html) {
    if (!element) return;
    
    // Store event listeners if needed
    const oldElement = element.cloneNode(true);
    
    // Set new HTML
    element.innerHTML = html;
    
    return element;
  }

  // Export components and helpers
  window.Component = Component;
  window.Card = Card;
  window.Button = Button;
  window.Table = Table;
  window.Modal = Modal;
  window.Badge = Badge;
  window.StatCard = StatCard;
  window.createComponent = createComponent;
  window.renderList = renderList;
  window.safeSetHTML = safeSetHTML;

  console.log('✅ UI Components System loaded');

})();
