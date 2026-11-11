/**
 * Dagoat TB-303 - High-Precision Vector Knob Controller
 * Manages authentic rotary potentiometer interactions (mouse, touch, wheel)
 * with real-time HUD tooltip display on interaction.
 */

class KnobController {
    constructor(element, options = {}) {
        if (!element) return;
        this.el = element;
        this.el._controller = this;
        this.minAngle = options.minAngle !== undefined ? options.minAngle : -135;
        this.maxAngle = options.maxAngle !== undefined ? options.maxAngle : 135;
        this.value = options.initialValue !== undefined ? options.initialValue : 0.5;
        this.defaultValue = this.value;
        this.sensitivity = options.sensitivity || 0.005;
        this.paramName = options.param || this.el.dataset.param;
        this.onChange = options.onChange || null;
        this.formatValue = options.formatValue || null;

        this.isDragging = false;
        this.startY = 0;
        this.startValue = 0;
        this.hideTooltipTimer = null;

        this.dial = this.el.querySelector('.knob-dial') || this.el;
        this.indicator = this.el.querySelector('.knob-indicator');

        // Create interactive HUD tooltip
        this.tooltip = this.createTooltip();

        this.init();
    }

    createTooltip() {
        let tip = this.el.querySelector('.knob-tooltip');
        if (!tip) {
            tip = document.createElement('div');
            tip.className = 'knob-tooltip';
            this.el.appendChild(tip);
        }
        return tip;
    }

    init() {
        this.updateRotation();

        // Mouse events
        this.el.addEventListener('mousedown', (e) => this.onMouseDown(e));
        // Touch events
        this.el.addEventListener('touchstart', (e) => this.onTouchStart(e), { passive: false });
        // Wheel events
        this.el.addEventListener('wheel', (e) => this.onWheel(e), { passive: false });
        // Double click reset
        this.el.addEventListener('dblclick', () => {
            this.setValue(this.defaultValue);
            this.showTooltip();
            this.hideTooltip(500);
            if (window.tb303Audio) window.tb303Audio.playClick();
        });
    }

    setValue(val, triggerCallback = true, showTip = false) {
        this.value = Math.max(0.0, Math.min(1.0, val));
        this.updateRotation();
        if (this.tooltip && (this.isDragging || showTip)) {
            this.showTooltip();
            if (showTip) this.hideTooltip(500);
        }
        if (triggerCallback && this.onChange) {
            this.onChange(this.value, this.paramName);
        }
    }

    updateRotation() {
        const angle = this.minAngle + this.value * (this.maxAngle - this.minAngle);
        if (this.dial) {
            this.dial.style.transform = `rotate(${angle}deg)`;
        }
    }

    /**
     * Formats the current parameter value with musical units
     */
    getFormattedValue() {
        if (this.formatValue) {
            return this.formatValue(this.value);
        }

        switch (this.paramName) {
            case 'tuning': {
                const st = Math.round((this.value - 0.5) * 24);
                return (st > 0 ? `+${st}` : `${st}`) + ' ST';
            }
            case 'cutoff': {
                const minCutoff = 280;
                const maxCutoff = 4800;
                const hz = Math.round(minCutoff * Math.pow(maxCutoff / minCutoff, this.value));
                return hz >= 1000 ? `${(hz / 1000).toFixed(2)} kHz` : `${hz} Hz`;
            }
            case 'resonance': {
                const pct = Math.round(this.value * 100);
                const scale10 = (this.value * 10).toFixed(1);
                return `${pct}% (Q ${scale10})`;
            }
            case 'envMod': {
                return `${Math.round(this.value * 100)}%`;
            }
            case 'decay': {
                // Decay between 200ms and 2200ms
                const sec = (0.18 + Math.pow(this.value, 1.8) * 2.0);
                return sec < 1.0 ? `${Math.round(sec * 1000)} ms` : `${sec.toFixed(2)} s`;
            }
            case 'accent': {
                return `${Math.round(this.value * 100)}%`;
            }
            case 'tempo': {
                const bpm = Math.round(40 + this.value * (240 - 40));
                return `${bpm} BPM`;
            }
            case 'volume': {
                return `${Math.round(this.value * 100)}%`;
            }
            case 'drive': {
                return `${Math.round(this.value * 100)}%`;
            }
            case 'delayMix': {
                return `${Math.round(this.value * 200)}% WET`;
            }
            case 'swing': {
                return this.value === 0 ? '0% (Straight)' : `${Math.round(this.value * 100)}% Swing`;
            }
            default:
                return `${Math.round(this.value * 100)}%`;
        }
    }

    showTooltip() {
        if (!this.tooltip) return;
        clearTimeout(this.hideTooltipTimer);
        this.tooltip.textContent = this.getFormattedValue();
        this.tooltip.classList.add('visible');
    }

    hideTooltip(delay = 400) {
        if (!this.tooltip) return;
        clearTimeout(this.hideTooltipTimer);
        this.hideTooltipTimer = setTimeout(() => {
            this.tooltip.classList.remove('visible');
        }, delay);
    }

    onMouseDown(e) {
        e.preventDefault();
        this.isDragging = true;
        this.startY = e.clientY;
        this.startValue = this.value;

        this.showTooltip();
        document.body.classList.add('knob-dragging');

        const onMouseMove = (ev) => {
            if (!this.isDragging) return;
            const dy = this.startY - ev.clientY; // Drag up to increase
            let step = dy * this.sensitivity;
            if (ev.shiftKey) step *= 0.2; // Shift key for fine tuning
            this.setValue(this.startValue + step);
            this.showTooltip();
        };

        const onMouseUp = () => {
            this.isDragging = false;
            document.body.classList.remove('knob-dragging');
            this.hideTooltip(400);
            window.removeEventListener('mousemove', onMouseMove);
            window.removeEventListener('mouseup', onMouseUp);
        };

        window.addEventListener('mousemove', onMouseMove);
        window.addEventListener('mouseup', onMouseUp);
    }

    onTouchStart(e) {
        if (e.touches.length !== 1) return;
        e.preventDefault();
        this.isDragging = true;
        this.startY = e.touches[0].clientY;
        this.startValue = this.value;

        this.showTooltip();

        const onTouchMove = (ev) => {
            if (!this.isDragging || ev.touches.length !== 1) return;
            ev.preventDefault();
            const dy = this.startY - ev.touches[0].clientY;
            this.setValue(this.startValue + dy * this.sensitivity * 1.5);
            this.showTooltip();
        };

        const onTouchEnd = () => {
            this.isDragging = false;
            this.hideTooltip(400);
            window.removeEventListener('touchmove', onTouchMove);
            window.removeEventListener('touchend', onTouchEnd);
        };

        window.addEventListener('touchmove', onTouchMove, { passive: false });
        window.addEventListener('touchend', onTouchEnd);
    }

    onWheel(e) {
        e.preventDefault();
        const delta = e.deltaY < 0 ? 0.03 : -0.03;
        this.setValue(this.value + delta);
        this.showTooltip();
        this.hideTooltip(600);
    }
}

window.KnobController = KnobController;
