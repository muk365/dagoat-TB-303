/**
 * Dagoat TB-303 - Complete High-Fidelity DSP Audio Engine
 * Faithful recreation of the Roland TB-303 Bass Line synthesizer
 */

class TB303AudioEngine {
    constructor() {
        this.ctx = null;
        this.isInitialized = false;

        // Current knob parameters (0.0 to 1.0 normalized)
        this.params = {
            tuning: 0.5,       // 0.5 = 440Hz / normal pitch, range: -12 to +12 semitones
            cutoff: 0.35,      // Filter cutoff frequency (logarithmic)
            resonance: 0.65,   // Filter resonance (Q factor)
            envMod: 0.55,      // Envelope modulation depth
            decay: 0.45,       // Filter decay time (0.2s to 2.2s)
            accent: 0.6,       // Accent intensity
            tempo: 125,        // 40 - 240 BPM
            volume: 0.8,       // Master volume
            waveform: 'saw',   // 'saw' or 'square'
            drive: 0.25,       // Built-in analog overdrive saturation
            delayTime: 0.375,  // Tempo-synced delay (dotted 8th)
            delayFeedback: 0.35,
            delayMix: 0.0      // 0 = off, up to 0.5 for dub acid
        };

        // Synth Voice Nodes
        this.masterGain = null;
        this.driveNode = null;
        this.delayNode = null;
        this.delayFeedbackGain = null;
        this.delayMixGain = null;
        this.dryGain = null;

        // Active voice references (monophonic bassline)
        this.currentOsc = null;
        this.filterLow = null;
        this.filterHigh = null;
        this.vcaGain = null;
        this.isPlayingNote = false;
        this.lastNoteEndTime = 0;
        this.lastFrequency = 110;
        this.isSlidingFromPrevious = false;

        // Periodic waveforms
        this.square303Wave = null;

        // Click sound for realistic button tactile feedback
        this.clickBuffer = null;
    }

    /**
     * Initializes the Web Audio Context after user interaction
     */
    async init() {
        if (this.isInitialized) return;

        const AudioCtx = window.AudioContext || window.webkitAudioContext;
        this.ctx = new AudioCtx({ latencyHint: 'interactive' });

        if (this.ctx.state === 'suspended') {
            await this.ctx.resume();
        }

        // Master output & Limiter to prevent clipping when resonance screams
        this.masterGain = this.ctx.createGain();
        this.masterGain.gain.setValueAtTime(this.params.volume, this.ctx.currentTime);

        const compressor = this.ctx.createDynamicsCompressor();
        compressor.threshold.setValueAtTime(-1.5, this.ctx.currentTime);
        compressor.knee.setValueAtTime(6, this.ctx.currentTime);
        compressor.ratio.setValueAtTime(12, this.ctx.currentTime);
        compressor.attack.setValueAtTime(0.003, this.ctx.currentTime);
        compressor.release.setValueAtTime(0.1, this.ctx.currentTime);

        // Saturation / Drive WaveShaper (for authentic analog 303 warm drive)
        this.driveNode = this.ctx.createWaveShaper();
        this.updateDriveCurve();

        // Delay effect unit (classic acid dub delay)
        this.delayNode = this.ctx.createDelay(2.0);
        this.delayNode.delayTime.setValueAtTime(0.3, this.ctx.currentTime);

        this.delayFeedbackGain = this.ctx.createGain();
        this.delayFeedbackGain.gain.setValueAtTime(this.params.delayFeedback, this.ctx.currentTime);

        const delayFilter = this.ctx.createBiquadFilter();
        delayFilter.type = 'lowpass';
        delayFilter.frequency.setValueAtTime(2800, this.ctx.currentTime);

        this.delayMixGain = this.ctx.createGain();
        this.delayMixGain.gain.setValueAtTime(this.params.delayMix, this.ctx.currentTime);

        this.dryGain = this.ctx.createGain();
        this.dryGain.gain.setValueAtTime(1.0, this.ctx.currentTime);

        // Routing Delay loop
        this.delayNode.connect(delayFilter);
        delayFilter.connect(this.delayFeedbackGain);
        this.delayFeedbackGain.connect(this.delayNode);
        delayFilter.connect(this.delayMixGain);

        // Routing Output
        this.driveNode.connect(this.dryGain);
        this.driveNode.connect(this.delayNode);
        this.dryGain.connect(this.masterGain);
        this.delayMixGain.connect(this.masterGain);

        this.masterGain.connect(compressor);
        compressor.connect(this.ctx.destination);

        // Build 303 custom asymmetric tilted square wave
        this.generate303SquareWave();

        // Build mechanical click sound buffer for UI buttons
        this.generateClickSound();

        this.isInitialized = true;
    }

    /**
     * Recreates the authentic asymmetric, differentiated 303 square wave
     * using Fourier series coefficients with low-order tilt.
     */
    generate303SquareWave() {
        const nHarmonics = 64;
        const real = new Float32Array(nHarmonics);
        const imag = new Float32Array(nHarmonics);

        real[0] = 0;
        imag[0] = 0;

        for (let n = 1; n < nHarmonics; n++) {
            if (n % 2 === 1) {
                // Square wave odd harmonics
                const base = 4 / (n * Math.PI);
                // 303 tilt compensation (RC high-pass filtering in hardware)
                const tilt = 1 - Math.exp(-n * 0.18);
                imag[n] = base * tilt;
                // Add slight asymmetric phase shift
                real[n] = (n === 1) ? 0.15 : (0.05 / n);
            } else {
                // Small even harmonics leakage from single-ended transistor design
                imag[n] = 0.08 / (n * n);
                real[n] = 0.04 / (n * n);
            }
        }

        try {
            this.square303Wave = this.ctx.createPeriodicWave(real, imag, { disableNormalization: false });
        } catch (e) {
            this.square303Wave = null; // fallback to native 'square'
        }
    }

    /**
     * Mechanical tactile plastic click sound when pushing 303 buttons
     */
    generateClickSound() {
        const sampleRate = this.ctx.sampleRate;
        const length = Math.floor(sampleRate * 0.012); // 12ms
        this.clickBuffer = this.ctx.createBuffer(1, length, sampleRate);
        const data = this.clickBuffer.getChannelData(0);
        for (let i = 0; i < length; i++) {
            const decay = Math.exp(-i / (sampleRate * 0.002));
            const noise = (Math.random() * 2 - 1) * 0.4;
            const sine = Math.sin(2 * Math.PI * 1800 * (i / sampleRate)) * 0.6;
            data[i] = (noise + sine) * decay;
        }
    }

    playClick() {
        if (!this.ctx || !this.clickBuffer) return;
        try {
            const src = this.ctx.createBufferSource();
            const gain = this.ctx.createGain();
            gain.gain.value = 0.12;
            src.buffer = this.clickBuffer;
            src.connect(gain);
            gain.connect(this.masterGain);
            src.start();
        } catch (e) {}
    }

    /**
     * Soft clipping saturation curve for the authentic analog drive
     */
    updateDriveCurve() {
        if (!this.driveNode || !this.ctx) return;
        const k = this.params.drive * 40; // drive factor
        const samples = 4096;
        const curve = new Float32Array(samples);
        const deg = Math.PI / 180;

        for (let i = 0; i < samples; ++i) {
            const x = (i * 2) / samples - 1;
            if (k === 0) {
                curve[i] = x;
            } else {
                // Symmetrical soft clip with subtle asymmetric 2nd harmonic warmth
                const tanh = Math.tanh((1 + k * 0.1) * x);
                const asym = 0.05 * Math.sin(Math.PI * x);
                curve[i] = (tanh + asym) / (1 + 0.05);
            }
        }
        this.driveNode.curve = curve;
        this.driveNode.oversample = '2x';
    }

    /**
     * Calculates the real cutoff frequency in Hz based on 303 hardware curve
     */
    getCalculatedCutoff(accentActive = false) {
        // Hardware 303 cutoff range: ~300 Hz up to ~4500 Hz
        const minCutoff = 280;
        const maxCutoff = 4800;
        const norm = Math.max(0.01, Math.min(1.0, this.params.cutoff));
        let hz = minCutoff * Math.pow(maxCutoff / minCutoff, norm);

        if (accentActive) {
            // Accent pushes cutoff higher depending on accent knob
            hz = Math.min(12000, hz + (2500 * this.params.accent));
        }
        return hz;
    }

    /**
     * Calculates the resonance Q factor for the cascaded 4-pole diode ladder
     */
    getCalculatedResonance(accentActive = false) {
        // 303 resonance goes from polite warm (Q=1.0) to screaming self-oscillation (Q=22)
        const minQ = 1.0;
        const maxQ = 22.0;
        let q = minQ + Math.pow(this.params.resonance, 2.2) * (maxQ - minQ);

        if (accentActive) {
            // Accent provides a temporary spike in resonance
            q = Math.min(26.0, q + (this.params.accent * 3.5));
        }
        return q;
    }

    /**
     * Calculates envelope modulation peak frequency in Hz
     */
    getEnvModAmount(accentActive = false) {
        // Env mod adds up to 4.5 octaves of frequency sweep
        let mod = this.params.envMod * 4200;
        if (accentActive) {
            mod += this.params.accent * 3000;
        }
        return mod;
    }

    /**
     * Plays a step on the TB-303
     * 
     * @param {Object} stepData - { frequency, gate, slide, accent, duration }
     * @param {number} time - AudioContext timeline anchor in seconds
     */
    triggerStep(stepData, time) {
        if (!this.ctx) return;
        if (this.ctx.state === 'suspended') {
            this.ctx.resume();
        }

        const {
            frequency = 110,
            gate = true,
            slide = false,
            accent = false,
            duration = 0.125
        } = stepData;

        // If step is a Rest, shut down gracefully if previous wasn't sliding
        if (!gate) {
            if (this.vcaGain && !this.isSlidingFromPrevious) {
                this.vcaGain.gain.setValueAtTime(this.vcaGain.gain.value, time);
                this.vcaGain.gain.exponentialRampToValueAtTime(0.0001, time + 0.02);
            }
            this.isSlidingFromPrevious = false;
            return;
        }

        // Apply global TUNING parameter (-12 to +12 semitones)
        const semitoneShift = (this.params.tuning - 0.5) * 24;
        const tunedFrequency = frequency * Math.pow(2, semitoneShift / 12);

        const isSlideIncoming = this.isSlidingFromPrevious && this.isPlayingNote && this.currentOsc;

        if (isSlideIncoming) {
            // ==========================================
            // SLIDE EVENT (Portamento without retrigger)
            // ==========================================
            // Smooth pitch glide over ~60ms (303 hardware spec)
            const glideTime = 0.060;
            const safeCurrentFreq = Math.max(20, this.lastFrequency || 110);
            this.currentOsc.frequency.cancelScheduledValues(time);
            this.currentOsc.frequency.setValueAtTime(safeCurrentFreq, time);
            this.currentOsc.frequency.exponentialRampToValueAtTime(Math.max(20, tunedFrequency), time + glideTime);

            // Sustain VCA through the slide
            const stepEnd = time + duration;
            const releaseTime = slide ? stepEnd : (stepEnd - 0.015);
            this.vcaGain.gain.cancelScheduledValues(time);
            this.vcaGain.gain.setValueAtTime(this.vcaGain.gain.value, time);

            const vcaLevel = accent ? (0.95 + 0.35 * this.params.accent) : 0.75;
            this.vcaGain.gain.linearRampToValueAtTime(vcaLevel, time + 0.01);

            if (!slide) {
                // Not sliding into next note: release at end of step
                this.vcaGain.gain.setValueAtTime(vcaLevel, releaseTime);
                this.vcaGain.gain.exponentialRampToValueAtTime(0.0001, stepEnd);
                try {
                    this.currentOsc.stop(stepEnd + 0.3);
                } catch(e) {}
            }

            // Filter decay continues or gently shifts
            if (accent) {
                const cutoffBase = this.getCalculatedCutoff(true);
                const envMod = this.getEnvModAmount(true);
                const targetCutoff = Math.min(14000, cutoffBase + envMod);
                this.filter1.frequency.setValueAtTime(targetCutoff, time);
                this.filter1.frequency.exponentialRampToValueAtTime(cutoffBase, time + 0.12);
                this.filter2.frequency.setValueAtTime(targetCutoff, time);
                this.filter2.frequency.exponentialRampToValueAtTime(cutoffBase, time + 0.12);
            }

        } else {
            // ==========================================
            // NEW NOTE TRIGGER (Full attack & envelopes)
            // ==========================================

            // Clean up previous voice if still lingering
            if (this.currentOsc) {
                try {
                    this.currentOsc.stop(time);
                    this.currentOsc.disconnect();
                } catch (e) {}
            }

            // 1. Oscillator Creation
            const osc = this.ctx.createOscillator();
            if (this.params.waveform === 'square' && this.square303Wave) {
                osc.setPeriodicWave(this.square303Wave);
            } else if (this.params.waveform === 'square') {
                osc.type = 'square';
            } else {
                osc.type = 'sawtooth';
            }

            osc.frequency.setValueAtTime(tunedFrequency, time);

            // 2. High-pass filter (303 subsonic rumble remover, 35Hz)
            const subHighpass = this.ctx.createBiquadFilter();
            subHighpass.type = 'highpass';
            subHighpass.frequency.setValueAtTime(36, time);
            subHighpass.Q.setValueAtTime(0.7, time);

            // 3. Dual-stage cascaded resonant low-pass filter (18-24 dB Diode ladder emulation)
            const f1 = this.ctx.createBiquadFilter();
            const f2 = this.ctx.createBiquadFilter();
            f1.type = 'lowpass';
            f2.type = 'lowpass';

            const baseCutoff = this.getCalculatedCutoff(accent);
            const resonanceQ = this.getCalculatedResonance(accent);
            const envModHz = this.getEnvModAmount(accent);

            // 303 filter decay: normal decay is 0.2s to 2.2s.
            // On accent, decay is shortened significantly (0.12s to 0.35s) for the famous "peoww" squelch!
            const filterDecay = accent 
                ? (0.12 + this.params.decay * 0.25) 
                : (0.18 + Math.pow(this.params.decay, 1.8) * 2.0);

            const peakCutoff = Math.min(14500, baseCutoff + envModHz);

            // Split Q between cascaded stages (Q on second stage drives self-oscillation)
            f1.Q.setValueAtTime(Math.min(resonanceQ * 0.4, 6.0), time);
            f2.Q.setValueAtTime(resonanceQ, time);

            // Initial attack of the filter (snappy 3ms)
            f1.frequency.setValueAtTime(baseCutoff, time);
            f1.frequency.exponentialRampToValueAtTime(peakCutoff, time + 0.004);
            f1.frequency.exponentialRampToValueAtTime(baseCutoff, time + filterDecay);

            f2.frequency.setValueAtTime(baseCutoff, time);
            f2.frequency.exponentialRampToValueAtTime(peakCutoff, time + 0.004);
            f2.frequency.exponentialRampToValueAtTime(baseCutoff, time + filterDecay);

            // 4. VCA Envelope (Amplitude)
            const vca = this.ctx.createGain();
            const noteGateTime = slide ? duration : (duration * 0.78); // Gate length: ~80% without slide, 100% with slide
            const attackTime = 0.003;
            const releaseTime = 0.025;

            // Accent boosts VCA amplitude
            const maxVcaGain = accent 
                ? (0.85 + 0.45 * this.params.accent) 
                : 0.75;

            vca.gain.setValueAtTime(0.0001, time);
            vca.gain.linearRampToValueAtTime(maxVcaGain, time + attackTime);

            if (!slide) {
                // Release at end of gate
                vca.gain.setValueAtTime(maxVcaGain, time + noteGateTime);
                vca.gain.exponentialRampToValueAtTime(0.0001, time + noteGateTime + releaseTime);
            } else {
                // Slide sustains open for the next note
                vca.gain.setValueAtTime(maxVcaGain, time + duration);
            }

            // 5. Connect Voice Graph
            osc.connect(subHighpass);
            subHighpass.connect(f1);
            f1.connect(f2);
            f2.connect(vca);
            vca.connect(this.driveNode);

            // Start oscillator
            osc.start(time);

            // If not sliding, safely stop after release + filter decay.
            // If sliding, keep oscillator alive until a non-sliding note ends the phrase.
            if (!slide) {
                const stopTime = time + duration + (filterDecay + 0.2);
                try {
                    osc.stop(stopTime);
                } catch(e) {}
            }

            // Save active references for slide & parameters
            this.currentOsc = osc;
            this.filter1 = f1;
            this.filter2 = f2;
            this.vcaGain = vca;
            this.isPlayingNote = true;
        }

        this.lastFrequency = tunedFrequency;
        this.isSlidingFromPrevious = slide;
    }

    /**
     * Stop all voices immediately
     */
    stopAll() {
        if (this.currentOsc) {
            try {
                this.currentOsc.stop();
                this.currentOsc.disconnect();
            } catch (e) {}
            this.currentOsc = null;
        }
        if (this.vcaGain && this.ctx) {
            this.vcaGain.gain.setValueAtTime(0, this.ctx.currentTime);
        }
        this.isPlayingNote = false;
        this.isSlidingFromPrevious = false;
    }

    /**
     * Live parameter updates from knobs and switches
     */
    setParam(paramName, value) {
        if (!(paramName in this.params)) return;
        this.params[paramName] = value;

        if (!this.ctx || !this.isInitialized) return;

        const now = this.ctx.currentTime;

        switch (paramName) {
            case 'volume':
                this.masterGain.gain.setTargetAtTime(value, now, 0.02);
                break;
            case 'drive':
                this.updateDriveCurve();
                break;
            case 'delayMix':
                this.delayMixGain.gain.setTargetAtTime(value, now, 0.02);
                break;
            case 'delayFeedback':
                this.delayFeedbackGain.gain.setTargetAtTime(Math.min(0.85, value), now, 0.02);
                break;
            case 'delayTime':
                this.delayNode.delayTime.setTargetAtTime(value, now, 0.02);
                break;
            case 'cutoff':
            case 'resonance':
                if (this.filter1 && this.filter2 && this.isPlayingNote) {
                    const cutoff = this.getCalculatedCutoff(false);
                    const q = this.getCalculatedResonance(false);
                    this.filter1.frequency.setTargetAtTime(cutoff, now, 0.03);
                    this.filter2.frequency.setTargetAtTime(cutoff, now, 0.03);
                    this.filter1.Q.setTargetAtTime(Math.min(q * 0.4, 6.0), now, 0.03);
                    this.filter2.Q.setTargetAtTime(q, now, 0.03);
                }
                break;
        }
    }
}

// Export singleton instance
window.tb303Audio = new TB303AudioEngine();
