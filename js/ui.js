/**
 * Dagoat TB-303 - Master UI Controller & Interaction Layer
 * Connects the authentic vintage front-panel, knobs, LEDs, keyboard,
 * pattern inspector, MIDI input, and audio recording.
 */

class TB303UI {
    constructor(audioEngine, sequencer) {
        this.audio = audioEngine;
        this.seq = sequencer;

        this.activeStepLed = null;
        this.tempoLedTimer = null;
        this.isRecording = false;
        this.mediaRecorder = null;
        this.audioChunks = [];

        this.init();
    }

    init() {
        this.setupKnobs();
        this.setupSwitches();
        this.setupKeypad();
        this.setupBankAndPatternSelectors();
        this.setupTransport();
        this.setupInspectorDrawer();
        this.setupKeyboardShortcuts();
        this.setupWebMIDI();
        this.setupAudioRecorder();

        // Hook sequencer updates
        this.seq.onStepChange = (stepIdx) => this.onSequencerStep(stepIdx);
        this.seq.onPatternChange = () => this.updateUIState();

        // Initial UI state
        this.updateUIState();
    }

    /**
     * Initializes all rotary potentiometers with custom scales and initial values
     */
    setupKnobs() {
        // Tuning
        new KnobController(document.getElementById('knob-tuning'), {
            initialValue: this.audio.params.tuning,
            onChange: (val) => this.audio.setParam('tuning', val)
        });

        // Cutoff Frequency
        new KnobController(document.getElementById('knob-cutoff'), {
            initialValue: this.audio.params.cutoff,
            onChange: (val) => this.audio.setParam('cutoff', val)
        });

        // Resonance
        new KnobController(document.getElementById('knob-resonance'), {
            initialValue: this.audio.params.resonance,
            onChange: (val) => this.audio.setParam('resonance', val)
        });

        // Envelope Modulation
        new KnobController(document.getElementById('knob-envmod'), {
            initialValue: this.audio.params.envMod,
            onChange: (val) => this.audio.setParam('envMod', val)
        });

        // Decay
        new KnobController(document.getElementById('knob-decay'), {
            initialValue: this.audio.params.decay,
            onChange: (val) => this.audio.setParam('decay', val)
        });

        // Accent
        new KnobController(document.getElementById('knob-accent'), {
            initialValue: this.audio.params.accent,
            onChange: (val) => this.audio.setParam('accent', val)
        });

        // Tempo (40 to 240 BPM)
        new KnobController(document.getElementById('knob-tempo'), {
            initialValue: (this.seq.tempo - 40) / (240 - 40),
            onChange: (val) => {
                const bpm = Math.round(40 + val * (240 - 40));
                this.seq.setTempo(bpm);
                const bpmDisplay = document.getElementById('tempo-readout');
                if (bpmDisplay) bpmDisplay.textContent = `${bpm} BPM`;
            }
        });

        // Volume
        new KnobController(document.getElementById('knob-volume'), {
            initialValue: this.audio.params.volume,
            onChange: (val) => this.audio.setParam('volume', val)
        });

        // Optional Mod Panel Knobs (Drive, Swing, Delay)
        const driveKnob = document.getElementById('knob-drive');
        if (driveKnob) {
            new KnobController(driveKnob, {
                initialValue: this.audio.params.drive,
                onChange: (val) => this.audio.setParam('drive', val)
            });
        }

        const delayKnob = document.getElementById('knob-delay');
        if (delayKnob) {
            new KnobController(delayKnob, {
                initialValue: this.audio.params.delayMix,
                onChange: (val) => this.audio.setParam('delayMix', val)
            });
        }

        const swingKnob = document.getElementById('knob-swing');
        if (swingKnob) {
            new KnobController(swingKnob, {
                initialValue: this.seq.swing,
                onChange: (val) => this.seq.setSwing(val)
            });
        }
    }

    /**
     * Set up Waveform and Overdrive Slide Switches
     */
    setupSwitches() {
        const waveSwitch = document.getElementById('switch-waveform');
        if (waveSwitch) {
            waveSwitch.addEventListener('click', () => {
                this.audio.playClick();
                const isSquare = waveSwitch.classList.toggle('active-square');
                const wave = isSquare ? 'square' : 'saw';
                this.audio.setParam('waveform', wave);
            });
        }

        const driveSwitch = document.getElementById('switch-drive');
        if (driveSwitch) {
            driveSwitch.addEventListener('click', () => {
                this.audio.playClick();
                const isOverdriven = driveSwitch.classList.toggle('active');
                this.audio.setParam('drive', isOverdriven ? 0.75 : 0.2);
            });
        }
    }

    /**
     * Set up the 16-key TB-303 Keyboard & Step Function keys
     */
    setupKeypad() {
        const keys = document.querySelectorAll('.key-btn');
        keys.forEach(key => {
            key.addEventListener('click', () => {
                this.audio.playClick();
                const note = key.dataset.note;
                const stepIdx = parseInt(key.dataset.step, 10) - 1; // 0 to 15

                if (!this.seq.isPlaying) {
                    // In live stopped mode, preview note
                    const curStep = this.seq.getStepData(this.seq.selectedStep);
                    this.seq.playManualNote(note, curStep.octave, curStep.accent, curStep.slide);
                }

                // Assign note to the currently selected editing step
                const curStepData = this.seq.getStepData(this.seq.selectedStep);
                curStepData.note = note;
                curStepData.gate = true; // pressing note automatically activates gate
                this.seq.saveToStorage();
                this.updateUIState();
            });
        });

        // Step selector buttons (1 to 16)
        const stepSelectBtns = document.querySelectorAll('.step-select-btn');
        stepSelectBtns.forEach(btn => {
            btn.addEventListener('click', () => {
                this.audio.playClick();
                const stepNum = parseInt(btn.dataset.step, 10);
                this.setSelectedStep(stepNum);
            });
        });

        // Pitch Octave Transpose DOWN
        const downBtn = document.getElementById('btn-down');
        if (downBtn) {
            downBtn.addEventListener('click', () => {
                this.audio.playClick();
                const step = this.seq.getStepData(this.seq.selectedStep);
                step.octave = (step.octave === -1) ? 0 : -1;
                this.seq.saveToStorage();
                this.updateUIState();
            });
        }

        // Pitch Octave Transpose UP
        const upBtn = document.getElementById('btn-up');
        if (upBtn) {
            upBtn.addEventListener('click', () => {
                this.audio.playClick();
                const step = this.seq.getStepData(this.seq.selectedStep);
                step.octave = (step.octave === 1) ? 0 : 1;
                this.seq.saveToStorage();
                this.updateUIState();
            });
        }

        // ACCENT button toggle
        const accentBtn = document.getElementById('btn-accent');
        if (accentBtn) {
            accentBtn.addEventListener('click', () => {
                this.audio.playClick();
                const step = this.seq.getStepData(this.seq.selectedStep);
                step.accent = !step.accent;
                this.seq.saveToStorage();
                this.updateUIState();
            });
        }

        // SLIDE button toggle
        const slideBtn = document.getElementById('btn-slide');
        if (slideBtn) {
            slideBtn.addEventListener('click', () => {
                this.audio.playClick();
                const step = this.seq.getStepData(this.seq.selectedStep);
                step.slide = !step.slide;
                this.seq.saveToStorage();
                this.updateUIState();
            });
        }

        // REST button toggle (Gate on/off)
        const restBtn = document.getElementById('btn-rest');
        if (restBtn) {
            restBtn.addEventListener('click', () => {
                this.audio.playClick();
                const step = this.seq.getStepData(this.seq.selectedStep);
                step.gate = !step.gate;
                this.seq.saveToStorage();
                this.updateUIState();
            });
        }

        // CLEAR button
        const clearBtn = document.getElementById('btn-clear');
        if (clearBtn) {
            clearBtn.addEventListener('click', () => {
                this.audio.playClick();
                if (confirm('Effacer le motif actuel (Clear Pattern) ?')) {
                    this.seq.clearPattern();
                }
            });
        }

        // RANDOM ACID GENERATOR button
        const randomBtn = document.getElementById('btn-random');
        if (randomBtn) {
            randomBtn.addEventListener('click', () => {
                this.audio.playClick();
                this.seq.randomizePattern();
            });
        }

        // PRESET SELECTOR (Drop-down / button)
        const presetSelect = document.getElementById('preset-selector');
        if (presetSelect) {
            presetSelect.addEventListener('change', (e) => {
                this.audio.playClick();
                const val = parseInt(e.target.value, 10);
                this.seq.selectPattern(val);
            });
        }
    }

    /**
     * Bank (I, II, III, IV) and Pattern (1 to 8) buttons with Pattern Chaining
     */
    setupBankAndPatternSelectors() {
        const bankBtns = document.querySelectorAll('.bank-select-btn');
        bankBtns.forEach(btn => {
            btn.addEventListener('click', () => {
                this.audio.playClick();
                const bankIdx = parseInt(btn.dataset.bank, 10);
                this.seq.selectBank(bankIdx);
            });
        });

        const patBtns = document.querySelectorAll('.pat-select-btn');
        patBtns.forEach(btn => {
            btn.addEventListener('click', (e) => {
                this.audio.playClick();
                const patIdx = parseInt(btn.dataset.pat, 10);
                // Shift-click selects range (TB-303 hardware two-button hold style)
                // Ctrl-click or Chain Mode toggles pattern in chain
                const isRange = e.shiftKey;
                const isToggle = e.ctrlKey || e.metaKey || this.seq.chainMode;
                this.seq.selectPattern(patIdx, isRange, isToggle);
            });
        });

        // Dedicated Pattern Chain Mode Toggle Button
        const chainToggleBtn = document.getElementById('btn-chain-mode');
        if (chainToggleBtn) {
            chainToggleBtn.addEventListener('click', () => {
                this.audio.playClick();
                const active = this.seq.toggleChainMode();
                chainToggleBtn.classList.toggle('active', active);
                const chainLed = document.getElementById('led-chain');
                if (chainLed) chainLed.classList.toggle('lit', active);
                this.updateUIState();
            });
        }

        // Mode buttons: Pattern Play vs Pattern Write
        const modePlayBtn = document.getElementById('btn-mode-play');
        const modeWriteBtn = document.getElementById('btn-mode-write');
        if (modePlayBtn && modeWriteBtn) {
            modePlayBtn.addEventListener('click', () => {
                this.audio.playClick();
                modePlayBtn.classList.add('active');
                modeWriteBtn.classList.remove('active');
            });
            modeWriteBtn.addEventListener('click', () => {
                this.audio.playClick();
                modeWriteBtn.classList.add('active');
                modePlayBtn.classList.remove('active');
            });
        }
    }

    /**
     * Start / Stop big square button with flashing Run LED
     */
    setupTransport() {
        const startStopBtn = document.getElementById('btn-start-stop');
        const startLed = document.getElementById('led-start');

        if (startStopBtn) {
            startStopBtn.addEventListener('click', async () => {
                this.audio.playClick();
                const playing = this.seq.toggle();
                startStopBtn.classList.toggle('active', playing);
                if (startLed) startLed.classList.toggle('lit', playing);
            });
        }
    }

    setSelectedStep(stepIndex) {
        this.seq.selectedStep = stepIndex;
        this.updateUIState();
    }

    /**
     * Sequencer Step Tick Handler
     */
    onSequencerStep(stepIndex, activePatternIndex) {
        // Step LEDs on 16-step keypad
        document.querySelectorAll('.step-led').forEach((led, idx) => {
            led.classList.toggle('lit', idx === stepIndex);
        });

        // Flash main tempo LED on quarter notes (steps 0, 4, 8, 12)
        const tempoLed = document.getElementById('led-tempo');
        if (tempoLed && stepIndex % 4 === 0 && stepIndex !== -1) {
            tempoLed.classList.add('lit');
            clearTimeout(this.tempoLedTimer);
            this.tempoLedTimer = setTimeout(() => {
                tempoLed.classList.remove('lit');
            }, 60);
        }

        // Highlight active playing pattern in the chain
        if (activePatternIndex !== undefined && activePatternIndex >= 0) {
            document.querySelectorAll('.pat-select-btn').forEach((btn, idx) => {
                const led = btn.querySelector('.mini-led');
                const isPlayingThis = (idx === activePatternIndex);
                const isInChain = this.seq.patternChain.includes(idx);
                if (led) {
                    led.classList.toggle('playing', isPlayingThis);
                    led.classList.toggle('lit', isInChain || isPlayingThis);
                }
                btn.classList.toggle('playing-pattern', isPlayingThis);
            });
        }

        // Highlight active column in Pattern Inspector matrix
        document.querySelectorAll('.matrix-col').forEach((col, idx) => {
            col.classList.toggle('playing', idx === stepIndex);
        });
    }

    /**
     * Refresh all UI elements, LEDs, Bank lights, and Pattern Inspector
     */
    updateUIState() {
        const currentPattern = this.seq.getCurrentPattern();
        const curStep = this.seq.getStepData(this.seq.selectedStep);

        // Update Bank LEDs
        document.querySelectorAll('.bank-select-btn').forEach((btn, idx) => {
            const led = btn.querySelector('.mini-led');
            if (led) led.classList.toggle('lit', idx === this.seq.currentBank);
        });

        // Update Pattern LEDs (Chained patterns are lit, current pattern is marked)
        document.querySelectorAll('.pat-select-btn').forEach((btn, idx) => {
            const led = btn.querySelector('.mini-led');
            const isInChain = this.seq.patternChain.includes(idx);
            const isSelected = (idx === this.seq.currentPatternIndex);
            btn.classList.toggle('in-chain', isInChain);
            btn.classList.toggle('current-selected', isSelected);
            if (led) {
                led.classList.toggle('lit', isInChain);
                led.classList.remove('playing');
            }
        });

        // Update Chain status badge
        const chainReadout = document.getElementById('chain-readout');
        if (chainReadout) {
            if (this.seq.patternChain.length > 1) {
                const chainNames = this.seq.patternChain.map(p => p + 1).join('→');
                chainReadout.textContent = `CHAIN: [${chainNames}] (${this.seq.patternChain.length * 16} PAS)`;
                chainReadout.classList.add('active');
            } else {
                chainReadout.textContent = `PATTERN: ${this.seq.currentPatternIndex + 1}`;
                chainReadout.classList.remove('active');
            }
        }

        // Update Preset dropdown if present
        const presetSelect = document.getElementById('preset-selector');
        if (presetSelect && this.seq.currentBank === 0) {
            presetSelect.value = this.seq.currentPatternIndex;
        }

        // Highlight selected step button
        document.querySelectorAll('.step-select-btn').forEach((btn, idx) => {
            btn.classList.toggle('selected', idx === this.seq.selectedStep);
        });

        // Update Modifier LEDs for the selected step
        const ledDown = document.getElementById('led-down');
        if (ledDown) ledDown.classList.toggle('lit', curStep.octave === -1);

        const ledUp = document.getElementById('led-up');
        if (ledUp) ledUp.classList.toggle('lit', curStep.octave === 1);

        const ledAccent = document.getElementById('led-accent');
        if (ledAccent) ledAccent.classList.toggle('lit', curStep.accent);

        const ledSlide = document.getElementById('led-slide');
        if (ledSlide) ledSlide.classList.toggle('lit', curStep.slide);

        const ledRest = document.getElementById('led-rest');
        if (ledRest) ledRest.classList.toggle('lit', !curStep.gate);

        // Highlight active note key for current step
        document.querySelectorAll('.key-btn').forEach(key => {
            const isCurrentNote = (key.dataset.note === curStep.note) && curStep.gate;
            key.classList.toggle('note-active', isCurrentNote);
        });

        // Refresh Inspector Matrix Grid if open
        this.renderInspectorMatrix();
    }

    /**
     * Drawer for the visual 16-Step Pattern Inspector (Matrix View)
     */
    setupInspectorDrawer() {
        const toggleBtn = document.getElementById('btn-toggle-inspector');
        const drawer = document.getElementById('pattern-inspector');
        if (toggleBtn && drawer) {
            toggleBtn.addEventListener('click', () => {
                this.audio.playClick();
                drawer.classList.toggle('open');
                toggleBtn.classList.toggle('active');
            });
        }
    }

    renderInspectorMatrix() {
        const matrixContainer = document.getElementById('matrix-grid');
        if (!matrixContainer) return;

        const pattern = this.seq.getCurrentPattern();
        matrixContainer.innerHTML = '';

        pattern.forEach((step, idx) => {
            const col = document.createElement('div');
            col.className = `matrix-col ${idx === this.seq.selectedStep ? 'editing' : ''}`;
            col.onclick = () => this.setSelectedStep(idx);

            col.innerHTML = `
                <div class="col-header">${idx + 1}</div>
                <div class="cell gate ${step.gate ? 'on' : 'off'}" title="Cliquer pour basculer Note / Silence">
                    ${step.gate ? step.note : 'REST'}
                </div>
                <div class="cell oct" title="Cliquer pour changer d'Octave (DN/MID/UP)">
                    ${step.octave === -1 ? 'DN' : (step.octave === 1 ? 'UP' : 'MID')}
                </div>
                <div class="cell acc ${step.accent ? 'on' : ''}" title="Cliquer pour basculer l'Accent">
                    ACC
                </div>
                <div class="cell sld ${step.slide ? 'on' : ''}" title="Cliquer pour basculer le Slide">
                    SLD
                </div>
            `;

            // Interactive direct cell click handlers
            const cellGate = col.querySelector('.cell.gate');
            cellGate.onclick = (e) => {
                e.stopPropagation();
                this.audio.playClick();
                this.setSelectedStep(idx);
                step.gate = !step.gate;
                this.seq.saveToStorage();
                this.updateUIState();
            };

            const cellOct = col.querySelector('.cell.oct');
            cellOct.onclick = (e) => {
                e.stopPropagation();
                this.audio.playClick();
                this.setSelectedStep(idx);
                if (step.octave === 0) step.octave = 1;
                else if (step.octave === 1) step.octave = -1;
                else step.octave = 0;
                this.seq.saveToStorage();
                this.updateUIState();
            };

            const cellAcc = col.querySelector('.cell.acc');
            cellAcc.onclick = (e) => {
                e.stopPropagation();
                this.audio.playClick();
                this.setSelectedStep(idx);
                step.accent = !step.accent;
                this.seq.saveToStorage();
                this.updateUIState();
            };

            const cellSld = col.querySelector('.cell.sld');
            cellSld.onclick = (e) => {
                e.stopPropagation();
                this.audio.playClick();
                this.setSelectedStep(idx);
                step.slide = !step.slide;
                this.seq.saveToStorage();
                this.updateUIState();
            };

            matrixContainer.appendChild(col);
        });
    }

    /**
     * Keyboard Shortcuts for Computer Keyboard Live Jamming
     */
    setupKeyboardShortcuts() {
        const keyMap = {
            'KeyA': 'C',
            'KeyW': 'C#',
            'KeyS': 'D',
            'KeyE': 'D#',
            'KeyD': 'E',
            'KeyF': 'F',
            'KeyT': 'F#',
            'KeyG': 'G',
            'KeyY': 'G#',
            'KeyH': 'A',
            'KeyU': 'A#',
            'KeyJ': 'B',
            'KeyK': 'C_HIGH'
        };

        window.addEventListener('keydown', (e) => {
            if (e.target.tagName === 'INPUT' || e.target.tagName === 'SELECT') return;

            if (e.code === 'Space') {
                e.preventDefault();
                this.seq.toggle();
                const btn = document.getElementById('btn-start-stop');
                if (btn) btn.classList.toggle('active', this.seq.isPlaying);
                return;
            }

            if (e.code === 'KeyR' && !e.ctrlKey) {
                this.seq.randomizePattern();
                return;
            }

            if (keyMap[e.code]) {
                const note = keyMap[e.code];
                const curStep = this.seq.getStepData(this.seq.selectedStep);
                this.seq.playManualNote(note, curStep.octave, curStep.accent, curStep.slide);
                curStep.note = note;
                curStep.gate = true;
                this.seq.saveToStorage();
                this.updateUIState();
            }
        });
    }

    /**
     * Web MIDI API Support: Plug & Play any MIDI keyboard/controller!
     */
    setupWebMIDI() {
        if (!navigator.requestMIDIAccess) return;

        navigator.requestMIDIAccess().then(midiAccess => {
            const inputs = midiAccess.inputs.values();
            for (let input of inputs) {
                input.onmidimessage = (msg) => this.handleMIDIMessage(msg);
            }
            midiAccess.onstatechange = (e) => {
                if (e.port.type === 'input' && e.port.state === 'connected') {
                    e.port.onmidimessage = (msg) => this.handleMIDIMessage(msg);
                }
            };
        }).catch(err => {
            console.log('Web MIDI access not available or denied.');
        });
    }

    handleMIDIMessage(event) {
        const [status, noteNumber, velocity] = event.data;
        const command = status >> 4;
        const channel = status & 0xf;

        // Note On (command 9)
        if (command === 9 && velocity > 0) {
            const noteNames = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];
            const noteName = noteNames[noteNumber % 12];
            const midiOctave = Math.floor(noteNumber / 12) - 1;
            let octave = 0;
            if (midiOctave < 2) octave = -1;
            else if (midiOctave > 2) octave = 1;

            const isAccented = velocity > 100;
            this.seq.playManualNote(noteName, octave, isAccented, false);
        }

        // Control Change (CC)
        if (command === 11) {
            const ccNumber = noteNumber;
            const ccValue = velocity / 127;

            if (ccNumber === 74) { // Standard Cutoff CC
                this.audio.setParam('cutoff', ccValue);
                const knob = document.getElementById('knob-cutoff');
                if (knob && knob._controller) knob._controller.setValue(ccValue, false, true);
            } else if (ccNumber === 71) { // Standard Resonance CC
                this.audio.setParam('resonance', ccValue);
                const knob = document.getElementById('knob-resonance');
                if (knob && knob._controller) knob._controller.setValue(ccValue, false, true);
            }
        }
    }

    /**
     * Audio Recorder (Export 16-step Loop to WAV / Audio file)
     */
    setupAudioRecorder() {
        const recordBtn = document.getElementById('btn-record-loop');
        if (!recordBtn) return;

        recordBtn.addEventListener('click', async () => {
            await this.audio.init();

            if (!this.isRecording) {
                // Start Recording
                const dest = this.audio.ctx.createMediaStreamDestination();
                this.audio.masterGain.connect(dest);

                this.mediaRecorder = new MediaRecorder(dest.stream);
                this.audioChunks = [];

                this.mediaRecorder.ondataavailable = (e) => {
                    if (e.data.size > 0) this.audioChunks.push(e.data);
                };

                this.mediaRecorder.onstop = () => {
                    const blob = new Blob(this.audioChunks, { type: 'audio/webm' });
                    const url = URL.createObjectURL(blob);
                    const a = document.createElement('a');
                    a.style.display = 'none';
                    a.href = url;
                    const chainInfo = this.seq.patternChain.map(p => p + 1).join('-');
                    a.download = `Dagoat_TB-303_Pattern_${chainInfo}.webm`;
                    document.body.appendChild(a);
                    a.click();
                    setTimeout(() => {
                        document.body.removeChild(a);
                        window.URL.revokeObjectURL(url);
                    }, 100);
                };

                this.mediaRecorder.start();
                this.isRecording = true;
                recordBtn.classList.add('recording');
                recordBtn.textContent = '⏹ Arrêter & Télécharger';

                // Automatically start sequencer if not running
                if (!this.seq.isPlaying) this.seq.start();

            } else {
                // Stop Recording
                this.mediaRecorder.stop();
                this.isRecording = false;
                recordBtn.classList.remove('recording');
                recordBtn.textContent = '⏺ Enregistrer la boucle';
            }
        });
    }
}

document.addEventListener('DOMContentLoaded', () => {
    window.tb303UI = new TB303UI(window.tb303Audio, window.tb303Sequencer);
});
