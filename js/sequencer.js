/**
 * Dagoat TB-303 - Complete Sequencer & Pattern Manager
 * Supports classic 16-step patterns, authentic 303 slide/accent logic,
 * pattern chaining (playing contiguous or multi-selected patterns in loop),
 * storage banks, classic presets, randomizer, and MIDI input.
 */

class TB303Sequencer {
    constructor(audioEngine) {
        this.audio = audioEngine;

        this.isPlaying = false;
        this.tempo = 125;
        this.swing = 0.0; // 0.0 (straight) to 0.5 (heavy swing)

        this.currentBank = 0;          // 0: Group I, 1: Group II, 2: Group III, 3: Group IV
        this.currentPatternIndex = 0;   // Currently focused pattern (0 to 7)
        this.patternChain = [0];       // Array of patterns in chain, e.g. [0, 1, 2, 3] (16 to 128 steps)
        this.chainIndex = 0;           // Current position within patternChain
        this.activePlayingPattern = 0; // Pattern currently producing sound
        this.currentStep = 0;          // 0 to 15
        this.selectedStep = 0;         // Selected step for manual editing (0 to 15)
        this.chainMode = false;        // Multi-select / chain mode toggle

        // Timing variables
        this.nextStepTime = 0.0;
        this.scheduleAheadTime = 0.12; // seconds
        this.lookaheadInterval = 25;    // ms
        this.timerID = null;

        // Frequencies reference table (Base octave is Octave 2 for 303 bass: C2 ~ 65.4 Hz to C3 ~ 130.8 Hz)
        this.NOTE_FREQUENCIES = {
            'C': 65.41,
            'C#': 69.30,
            'D': 73.42,
            'D#': 77.78,
            'E': 82.41,
            'F': 87.31,
            'F#': 92.50,
            'G': 98.00,
            'G#': 103.83,
            'A': 110.00,
            'A#': 116.54,
            'B': 123.47,
            'C_HIGH': 130.81
        };

        this.NOTE_ORDER = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B', 'C_HIGH'];

        // Bank data: 4 banks x 8 patterns
        this.banks = this.initializeBanks();

        // Callback for UI updates
        this.onStepChange = null;
        this.onPatternChange = null;
    }

    /**
     * Initializes pattern storage with preloaded iconic presets in Bank A (Group I)
     */
    initializeBanks() {
        const saved = localStorage.getItem('dagoat_tb303_patterns') || localStorage.getItem('ronfland_ttbm303_patterns');
        if (saved) {
            try {
                return JSON.parse(saved);
            } catch (e) {
                console.warn('Failed to parse saved patterns, reloading presets.');
            }
        }

        const banks = [];
        for (let b = 0; b < 4; b++) {
            const patterns = [];
            for (let p = 0; p < 8; p++) {
                patterns.push(this.createEmptyPattern());
            }
            banks.push(patterns);
        }

        // Preload Iconic Presets in Bank A (Group I)
        banks[0][0] = this.getPresetAcidTrax();
        banks[0][1] = this.getPresetDaFunk();
        banks[0][2] = this.getPresetHigherState();
        banks[0][3] = this.getPresetResonanceMadness();
        banks[0][4] = this.getPresetHardfloor();
        banks[0][5] = this.getPresetPlasticDreams();
        banks[0][6] = this.getPresetSquareBouncer();
        banks[0][7] = this.getPresetSubmarineAcid();

        return banks;
    }

    createEmptyPattern() {
        const pattern = [];
        for (let i = 0; i < 16; i++) {
            pattern.push({
                note: 'C',
                octave: 0,       // -1 = Down, 0 = Normal, +1 = Up
                gate: (i % 2 === 0), // Default note on even steps
                slide: false,
                accent: (i % 4 === 0)
            });
        }
        return pattern;
    }

    saveToStorage() {
        try {
            localStorage.setItem('dagoat_tb303_patterns', JSON.stringify(this.banks));
        } catch (e) {
            console.warn('LocalStorage save error:', e);
        }
    }

    // Pattern currently focused for editing/viewing
    getCurrentPattern() {
        return this.banks[this.currentBank][this.currentPatternIndex];
    }

    // Pattern currently producing audio
    getActivePlayingPatternData() {
        const patIdx = this.patternChain[this.chainIndex % this.patternChain.length];
        return this.banks[this.currentBank][patIdx];
    }

    getStepData(stepIndex) {
        const pattern = this.getCurrentPattern();
        return pattern[stepIndex % pattern.length];
    }

    calculateStepFrequency(step) {
        let baseFreq = this.NOTE_FREQUENCIES[step.note] || 110.0;
        let octaveMultiplier = 1;
        if (step.octave === -1) octaveMultiplier = 0.5;
        if (step.octave === 1) octaveMultiplier = 2.0;
        if (step.octave === 2) octaveMultiplier = 4.0;
        return baseFreq * octaveMultiplier;
    }

    /**
     * Start the sequencer playback
     */
    async start() {
        if (this.isPlaying) return;

        await this.audio.init();

        this.isPlaying = true;
        this.currentStep = 0;
        this.chainIndex = 0;
        this.activePlayingPattern = this.patternChain[0];
        this.nextStepTime = this.audio.ctx.currentTime + 0.05;

        this.timerID = setInterval(() => this.scheduler(), this.lookaheadInterval);
    }

    /**
     * Stop the sequencer playback
     */
    stop() {
        if (!this.isPlaying) return;

        this.isPlaying = false;
        clearInterval(this.timerID);
        this.timerID = null;
        this.chainIndex = 0;
        this.currentStep = 0;
        this.activePlayingPattern = this.patternChain[0];
        this.audio.stopAll();

        if (this.onStepChange) {
            this.onStepChange(-1, this.currentPatternIndex);
        }
    }

    toggle() {
        if (this.isPlaying) {
            this.stop();
        } else {
            this.start();
        }
        return this.isPlaying;
    }

    setTempo(bpm) {
        this.tempo = Math.max(40, Math.min(300, bpm));
    }

    setSwing(swingVal) {
        this.swing = Math.max(0.0, Math.min(0.5, swingVal));
    }

    selectBank(bankIndex) {
        if (bankIndex >= 0 && bankIndex < 4) {
            this.currentBank = bankIndex;
            if (this.onPatternChange) this.onPatternChange();
        }
    }

    /**
     * Select a pattern or chain a range of patterns (Authentic TB-303 Pattern Chaining)
     * @param {number} patternIndex (0 to 7)
     * @param {boolean} isRangeSelection (e.g. Shift-click or pressing two buttons)
     * @param {boolean} isToggle (e.g. toggle in chain)
     */
    selectPattern(patternIndex, isRangeSelection = false, isToggle = false) {
        if (patternIndex < 0 || patternIndex >= 8) return;

        if (isRangeSelection) {
            // Authentic TB-303 Pattern Chaining!
            // When pressing two pattern buttons (or Shift-clicking), chain all patterns from min to max!
            const start = Math.min(this.currentPatternIndex, patternIndex);
            const end = Math.max(this.currentPatternIndex, patternIndex);
            this.patternChain = [];
            for (let i = start; i <= end; i++) {
                this.patternChain.push(i);
            }
            this.currentPatternIndex = patternIndex;
        } else if (isToggle || this.chainMode) {
            // Toggle pattern in or out of chain
            const idx = this.patternChain.indexOf(patternIndex);
            if (idx > -1 && this.patternChain.length > 1) {
                this.patternChain.splice(idx, 1);
            } else if (idx === -1) {
                this.patternChain.push(patternIndex);
                this.patternChain.sort((a, b) => a - b);
            }
            this.currentPatternIndex = patternIndex;
        } else {
            // Single pattern selection
            this.currentPatternIndex = patternIndex;
            this.patternChain = [patternIndex];
        }

        // Reset chain index if currently beyond new chain length
        if (this.chainIndex >= this.patternChain.length) {
            this.chainIndex = 0;
        }
        this.activePlayingPattern = this.patternChain[this.chainIndex];

        if (this.onPatternChange) this.onPatternChange();
    }

    setPatternChain(chainArray) {
        if (Array.isArray(chainArray) && chainArray.length > 0) {
            this.patternChain = chainArray.filter(p => p >= 0 && p < 8);
            if (this.patternChain.length === 0) this.patternChain = [0];
            this.currentPatternIndex = this.patternChain[0];
            this.chainIndex = 0;
            this.activePlayingPattern = this.patternChain[0];
            if (this.onPatternChange) this.onPatternChange();
        }
    }

    toggleChainMode() {
        this.chainMode = !this.chainMode;
        return this.chainMode;
    }

    /**
     * Precision lookahead scheduler
     */
    scheduler() {
        while (this.nextStepTime < this.audio.ctx.currentTime + this.scheduleAheadTime) {
            this.scheduleStep(this.currentStep, this.nextStepTime);
            this.advanceStep();
        }
    }

    advanceStep() {
        const secondsPerBeat = 60.0 / this.tempo;
        let stepDuration = 0.25 * secondsPerBeat; // 16th note

        // Apply shuffle / swing to odd steps
        if (this.currentStep % 2 === 0) {
            stepDuration += this.swing * (0.25 * secondsPerBeat * 0.5);
        } else {
            stepDuration -= this.swing * (0.25 * secondsPerBeat * 0.5);
        }

        this.nextStepTime += Math.max(0.03, stepDuration);

        // Pattern Chaining advance: when step 15 finishes, advance to next pattern in chain!
        if (this.currentStep === 15) {
            this.currentStep = 0;
            this.chainIndex = (this.chainIndex + 1) % this.patternChain.length;
            this.activePlayingPattern = this.patternChain[this.chainIndex];
        } else {
            this.currentStep++;
        }
    }

    scheduleStep(stepIndex, time) {
        const currentPatIdx = this.patternChain[this.chainIndex % this.patternChain.length];
        const patternData = this.banks[this.currentBank][currentPatIdx];
        const step = patternData[stepIndex % patternData.length];

        const secondsPerBeat = 60.0 / this.tempo;
        const stepDuration = 0.25 * secondsPerBeat;

        const freq = this.calculateStepFrequency(step);

        this.audio.triggerStep({
            frequency: freq,
            gate: step.gate,
            slide: step.slide,
            accent: step.accent,
            duration: stepDuration
        }, time);

        // Schedule visual LED highlight exactly in sync with audio
        if (this.onStepChange) {
            const delayMs = Math.max(0, (time - this.audio.ctx.currentTime) * 1000);
            setTimeout(() => {
                if (this.isPlaying) {
                    this.onStepChange(stepIndex, currentPatIdx);
                }
            }, delayMs);
        }
    }

    /**
     * Play a single note immediately (e.g. keyboard click or preview)
     */
    playManualNote(note, octave = 0, accent = false, slide = false) {
        this.audio.init().then(() => {
            let baseFreq = this.NOTE_FREQUENCIES[note] || 110.0;
            let octaveMultiplier = (octave === -1) ? 0.5 : (octave === 1 ? 2.0 : 1.0);
            const freq = baseFreq * octaveMultiplier;

            this.audio.triggerStep({
                frequency: freq,
                gate: true,
                slide: slide,
                accent: accent,
                duration: 0.25
            }, this.audio.ctx.currentTime);
        });
    }

    /**
     * Algorithmic Acid Pattern Generator
     * Produces authentic, infectious TB-303 lines using minor pentatonic & dorian scales
     */
    randomizePattern() {
        const pattern = this.getCurrentPattern();
        // Minor Pentatonic / Acid scale degrees
        const acidNotes = ['C', 'D#', 'F', 'F#', 'G', 'A#', 'C_HIGH'];
        const octaves = [-1, 0, 0, 0, 1]; // biased toward normal octave

        for (let i = 0; i < 16; i++) {
            const isRest = Math.random() < 0.22; // ~22% rests
            const note = acidNotes[Math.floor(Math.random() * acidNotes.length)];
            const octave = octaves[Math.floor(Math.random() * octaves.length)];
            const accent = Math.random() < 0.32; // ~32% accents
            const slide = (!isRest && Math.random() < 0.28); // ~28% slides

            pattern[i] = {
                note: note,
                octave: octave,
                gate: !isRest,
                slide: slide,
                accent: accent
            };
        }

        this.saveToStorage();
        if (this.onPatternChange) this.onPatternChange();
    }

    /**
     * Clear the current pattern
     */
    clearPattern() {
        const pattern = this.getCurrentPattern();
        for (let i = 0; i < 16; i++) {
            pattern[i] = {
                note: 'C',
                octave: 0,
                gate: false,
                slide: false,
                accent: false
            };
        }
        this.saveToStorage();
        if (this.onPatternChange) this.onPatternChange();
    }

    // ==========================================
    // FAMOUS PRESET PATTERNS
    // ==========================================

    getPresetAcidTrax() {
        // Phuture - Acid Trax riff
        const raw = [
            { note: 'C', oct: 0, g: true, a: true, s: false },
            { note: 'C', oct: 1, g: true, a: false, s: true },
            { note: 'A#', oct: 0, g: true, a: true, s: false },
            { note: 'C', oct: 0, g: true, a: false, s: false },
            { note: 'D#', oct: 0, g: true, a: true, s: true },
            { note: 'F', oct: 0, g: true, a: false, s: false },
            { note: 'C', oct: 0, g: true, a: true, s: false },
            { note: 'C', oct: -1, g: true, a: false, s: false },
            { note: 'C', oct: 0, g: true, a: true, s: true },
            { note: 'G', oct: 0, g: true, a: false, s: false },
            { note: 'F#', oct: 0, g: true, a: true, s: true },
            { note: 'F', oct: 0, g: true, a: false, s: false },
            { note: 'D#', oct: 0, g: true, a: true, s: false },
            { note: 'C', oct: 0, g: true, a: false, s: true },
            { note: 'A#', oct: -1, g: true, a: true, s: false },
            { note: 'C', oct: 0, g: true, a: false, s: false }
        ];
        return raw.map(r => ({ note: r.note, octave: r.oct, gate: r.g, accent: r.a, slide: r.s }));
    }

    getPresetDaFunk() {
        // Daft Punk - Da Funk style 303 riff
        const raw = [
            { note: 'G', oct: 0, g: true, a: true, s: false },
            { note: 'G', oct: 0, g: false, a: false, s: false },
            { note: 'A#', oct: 0, g: true, a: true, s: true },
            { note: 'C', oct: 1, g: true, a: false, s: false },
            { note: 'G', oct: 0, g: true, a: false, s: false },
            { note: 'F', oct: 0, g: true, a: true, s: false },
            { note: 'F#', oct: 0, g: true, a: false, s: true },
            { note: 'G', oct: 0, g: true, a: true, s: false },
            { note: 'G', oct: 0, g: false, a: false, s: false },
            { note: 'D', oct: 0, g: true, a: false, s: false },
            { note: 'F', oct: 0, g: true, a: true, s: true },
            { note: 'D', oct: 0, g: true, a: false, s: false },
            { note: 'C', oct: 0, g: true, a: true, s: false },
            { note: 'A#', oct: -1, g: true, a: false, s: false },
            { note: 'C', oct: 0, g: true, a: true, s: true },
            { note: 'D', oct: 0, g: true, a: false, s: false }
        ];
        return raw.map(r => ({ note: r.note, octave: r.oct, gate: r.g, accent: r.a, slide: r.s }));
    }

    getPresetHigherState() {
        // Josh Wink - Higher State of Consciousness rolling line
        const raw = [
            { note: 'A', oct: 0, g: true, a: true, s: false },
            { note: 'A', oct: 0, g: true, a: false, s: true },
            { note: 'C', oct: 1, g: true, a: true, s: false },
            { note: 'A', oct: 0, g: true, a: false, s: false },
            { note: 'A', oct: 0, g: true, a: true, s: false },
            { note: 'D', oct: 1, g: true, a: false, s: true },
            { note: 'C', oct: 1, g: true, a: true, s: false },
            { note: 'A', oct: 0, g: true, a: false, s: false },
            { note: 'G', oct: 0, g: true, a: true, s: true },
            { note: 'A', oct: 0, g: true, a: false, s: false },
            { note: 'A', oct: 0, g: true, a: true, s: false },
            { note: 'E', oct: 1, g: true, a: false, s: true },
            { note: 'D', oct: 1, g: true, a: true, s: false },
            { note: 'C', oct: 1, g: true, a: false, s: false },
            { note: 'G', oct: 0, g: true, a: true, s: true },
            { note: 'A', oct: 0, g: true, a: false, s: false }
        ];
        return raw.map(r => ({ note: r.note, octave: r.oct, gate: r.g, accent: r.a, slide: r.s }));
    }

    getPresetResonanceMadness() {
        const raw = [
            { note: 'C', oct: -1, g: true, a: true, s: false },
            { note: 'C', oct: 0, g: true, a: false, s: true },
            { note: 'D#', oct: 0, g: true, a: true, s: false },
            { note: 'C', oct: 0, g: true, a: false, s: false },
            { note: 'F', oct: 0, g: true, a: true, s: true },
            { note: 'F#', oct: 0, g: true, a: true, s: false },
            { note: 'G', oct: 0, g: true, a: false, s: true },
            { note: 'C', oct: 1, g: true, a: true, s: false },
            { note: 'A#', oct: 0, g: true, a: false, s: false },
            { note: 'G', oct: 0, g: true, a: true, s: true },
            { note: 'F', oct: 0, g: true, a: false, s: false },
            { note: 'D#', oct: 0, g: true, a: true, s: false },
            { note: 'C', oct: 0, g: true, a: false, s: true },
            { note: 'G#', oct: -1, g: true, a: true, s: false },
            { note: 'A#', oct: -1, g: true, a: false, s: true },
            { note: 'B', oct: -1, g: true, a: false, s: false }
        ];
        return raw.map(r => ({ note: r.note, octave: r.oct, gate: r.g, accent: r.a, slide: r.s }));
    }

    getPresetHardfloor() {
        const raw = [
            { note: 'E', oct: 0, g: true, a: true, s: false },
            { note: 'E', oct: 0, g: false, a: false, s: false },
            { note: 'G', oct: 0, g: true, a: false, s: true },
            { note: 'A', oct: 0, g: true, a: true, s: false },
            { note: 'E', oct: 0, g: true, a: false, s: false },
            { note: 'B', oct: 0, g: true, a: true, s: true },
            { note: 'D', oct: 1, g: true, a: false, s: false },
            { note: 'E', oct: 0, g: true, a: false, s: false },
            { note: 'D', oct: 0, g: true, a: true, s: false },
            { note: 'E', oct: 0, g: false, a: false, s: false },
            { note: 'G', oct: 0, g: true, a: true, s: true },
            { note: 'A', oct: 0, g: true, a: false, s: false },
            { note: 'G', oct: 0, g: true, a: true, s: false },
            { note: 'F#', oct: 0, g: true, a: false, s: true },
            { note: 'E', oct: -1, g: true, a: true, s: false },
            { note: 'E', oct: 0, g: true, a: false, s: false }
        ];
        return raw.map(r => ({ note: r.note, octave: r.oct, gate: r.g, accent: r.a, slide: r.s }));
    }

    getPresetPlasticDreams() {
        const raw = [
            { note: 'F', oct: 0, g: true, a: true, s: false },
            { note: 'F', oct: 0, g: false, a: false, s: false },
            { note: 'G#', oct: 0, g: true, a: false, s: true },
            { note: 'A#', oct: 0, g: true, a: true, s: false },
            { note: 'C', oct: 1, g: true, a: false, s: false },
            { note: 'A#', oct: 0, g: true, a: true, s: true },
            { note: 'G#', oct: 0, g: true, a: false, s: false },
            { note: 'F', oct: 0, g: true, a: false, s: false },
            { note: 'D#', oct: 0, g: true, a: true, s: false },
            { note: 'F', oct: 0, g: false, a: false, s: false },
            { note: 'G#', oct: 0, g: true, a: true, s: true },
            { note: 'C', oct: 1, g: true, a: false, s: false },
            { note: 'C#', oct: 1, g: true, a: true, s: false },
            { note: 'C', oct: 1, g: true, a: false, s: true },
            { note: 'A#', oct: 0, g: true, a: true, s: false },
            { note: 'G#', oct: 0, g: true, a: false, s: false }
        ];
        return raw.map(r => ({ note: r.note, octave: r.oct, gate: r.g, accent: r.a, slide: r.s }));
    }

    getPresetSquareBouncer() {
        const raw = [
            { note: 'A', oct: -1, g: true, a: true, s: false },
            { note: 'A', oct: 0, g: true, a: false, s: true },
            { note: 'C', oct: 0, g: true, a: true, s: false },
            { note: 'D', oct: 0, g: true, a: false, s: false },
            { note: 'E', oct: 0, g: true, a: true, s: true },
            { note: 'G', oct: 0, g: true, a: false, s: false },
            { note: 'A', oct: 0, g: true, a: true, s: false },
            { note: 'G', oct: 0, g: true, a: false, s: true },
            { note: 'E', oct: 0, g: true, a: true, s: false },
            { note: 'D', oct: 0, g: true, a: false, s: false },
            { note: 'C', oct: 0, g: true, a: true, s: true },
            { note: 'A', oct: -1, g: true, a: false, s: false },
            { note: 'G', oct: -1, g: true, a: true, s: false },
            { note: 'A', oct: -1, g: true, a: false, s: true },
            { note: 'C', oct: 0, g: true, a: true, s: false },
            { note: 'D', oct: 0, g: true, a: false, s: false }
        ];
        return raw.map(r => ({ note: r.note, octave: r.oct, gate: r.g, accent: r.a, slide: r.s }));
    }

    getPresetSubmarineAcid() {
        const raw = [
            { note: 'D', oct: -1, g: true, a: true, s: false },
            { note: 'D', oct: -1, g: true, a: false, s: false },
            { note: 'F', oct: 0, g: true, a: true, s: true },
            { note: 'A', oct: 0, g: true, a: false, s: false },
            { note: 'D', oct: 0, g: true, a: false, s: false },
            { note: 'C', oct: 1, g: true, a: true, s: true },
            { note: 'A', oct: 0, g: true, a: false, s: false },
            { note: 'F', oct: 0, g: true, a: true, s: false },
            { note: 'G', oct: 0, g: true, a: false, s: true },
            { note: 'G#', oct: 0, g: true, a: true, s: false },
            { note: 'A', oct: 0, g: true, a: false, s: false },
            { note: 'D', oct: 0, g: true, a: true, s: true },
            { note: 'F', oct: 0, g: true, a: false, s: false },
            { note: 'E', oct: 0, g: true, a: true, s: false },
            { note: 'C', oct: 0, g: true, a: false, s: true },
            { note: 'D', oct: -1, g: true, a: true, s: false }
        ];
        return raw.map(r => ({ note: r.note, octave: r.oct, gate: r.g, accent: r.a, slide: r.s }));
    }
}

window.tb303Sequencer = new TB303Sequencer(window.tb303Audio);
