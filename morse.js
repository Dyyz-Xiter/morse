document.getElementById("textInput").addEventListener("input", function () {
    this.value = this.value.toUpperCase();
});

var ctx = new (window.AudioContext || window.webkitAudioContext)();
var currentTimeouts = [];
var isPaused = false;
var resumeIndex = 0;

var code = {
    'A': '.-', 'B': '-...', 'C': '-.-.', 'D': '-..', 'E': '.',
    'F': '..-.', 'G': '--.', 'H': '....', 'I': '..', 'J': '.---',
    'K': '-.-', 'L': '.-..', 'M': '--', 'N': '-.', 'O': '---',
    'P': '.--.', 'Q': '--.-', 'R': '.-.', 'S': '...', 'T': '-',
    'U': '..-', 'V': '...-', 'W': '.--', 'X': '-..-', 'Y': '-.--',
    'Z': '--..', '0': '-----', '1': '.----', '2': '..---',
    '3': '...--', '4': '....-', '5': '.....', '6': '-....',
    '7': '--...', '8': '---..', '9': '----.', ' ': '/'
};

function encodeMorse(text) {
    return text.toUpperCase().split('').map(c => code[c] || '').join(' ');
}

function stopAllSounds() {
    currentTimeouts.forEach(timeout => clearTimeout(timeout));
    currentTimeouts = [];
    isPaused = true;
}

function generateTone(freq, duration, volume) {
    if (isPaused) return;
    
    var osc = ctx.createOscillator();
    var gain = ctx.createGain();
    
    osc.frequency.value = freq;
    gain.gain.value = volume;
    
    osc.connect(gain);
    gain.connect(ctx.destination);
    
    osc.start();
    osc.stop(ctx.currentTime + duration);
}

function playMorse(startIndex = 0) {
    stopAllSounds();
    isPaused = false;

    var text = document.getElementById("textInput").value;
    var morseCode = encodeMorse(text);
    document.getElementById("morseOutput").value = morseCode;

    var tone = parseInt(document.getElementById("tone").value);
    var wpm = parseInt(document.getElementById("speed").value);
    var volume = parseInt(document.getElementById("volume").value) / 100;

    var unitTime = 1.2 / wpm;
    var delay = 0;
    var symbols = morseCode.split('');

    for (let i = startIndex; i < symbols.length; i++) {
        let symbol = symbols[i];

        let timeout = setTimeout(() => {
            if (symbol === ".") {
                generateTone(tone, unitTime, volume);
            } else if (symbol === "-") {
                generateTone(tone, unitTime * 3, volume);
            }
            resumeIndex = i + 1;
        }, delay * 1000);

        currentTimeouts.push(timeout);

        if (symbol === ".") {
            delay += unitTime * 2;
        } else if (symbol === "-") {
            delay += unitTime * 4;
        } else if (symbol === "/") {
            delay += unitTime * 7;
        } else {
            delay += unitTime * 3;
        }
    }
}

function pauseMorse() {
    stopAllSounds();
}

function resumeMorse() {
    if (isPaused) {
        playMorse(resumeIndex);
    }
}

function restartMorse() {
    playMorse();
}

async function generateMorseAudioBuffer(text, tone, wpm, volume) {
    let morseCode = encodeMorse(text);
    let unitTime = 1.2 / wpm;
    let sampleRate = 44100;
    let bufferLength = Math.ceil(sampleRate * unitTime * morseCode.length * 10);
    let offlineCtx = new OfflineAudioContext(1, bufferLength, sampleRate);
    let audioBuffer = offlineCtx.createBuffer(1, bufferLength, sampleRate);
    let channelData = audioBuffer.getChannelData(0);
    let index = 0;

    function addTone(duration) {
        let samples = Math.floor(sampleRate * duration);
        for (let i = 0; i < samples; i++) {
            channelData[index++] = Math.sin(2 * Math.PI * tone * (i / sampleRate)) * volume;
        }
        addSilence(unitTime);
    }

    function addSilence(duration) {
        let samples = Math.floor(sampleRate * duration);
        index += samples;
    }

    for (let symbol of morseCode) {
        if (symbol === ".") {
            addTone(unitTime);
        } else if (symbol === "-") {
            addTone(unitTime * 3);
        } else if (symbol === "/") {
            addSilence(unitTime * 7);
        } else {
            addSilence(unitTime * 3);
        }
    }

    return audioBuffer;
}

function bufferToWave(abuffer, len) {
    let buffer = new ArrayBuffer(44 + len * 2);
    let view = new DataView(buffer);

    function writeString(view, offset, string) {
        for (let i = 0; i < string.length; i++) {
            view.setUint8(offset + i, string.charCodeAt(i));
        }
    }

    let sampleRate = abuffer.sampleRate;
    let numChannels = abuffer.numberOfChannels;
    let samples = abuffer.getChannelData(0);

    writeString(view, 0, "RIFF");
    view.setUint32(4, 36 + len * 2, true);
    writeString(view, 8, "WAVE");
    writeString(view, 12, "fmt ");
    view.setUint32(16, 16, true);
    view.setUint16(20, 1, true);
    view.setUint16(22, numChannels, true);
    view.setUint32(24, sampleRate, true);
    view.setUint32(28, sampleRate * numChannels * 2, true);
    view.setUint16(32, numChannels * 2, true);
    view.setUint16(34, 16, true);
    writeString(view, 36, "data");
    view.setUint32(40, len * 2, true);

    let offset = 44;
    for (let i = 0; i < len; i++, offset += 2) {
        let s = Math.max(-1, Math.min(1, samples[i]));
        view.setInt16(offset, s < 0 ? s * 0x8000 : s * 0x7FFF, true);
    }

    return new Blob([buffer], { type: "audio/wav" });
}

async function downloadMorseAsMP3() {
    let text = document.getElementById("textInput").value;
    if (!text) {
        alert("Masukkan teks terlebih dahulu!");
        return;
    }

    let tone = parseInt(document.getElementById("tone").value);
    let wpm = parseInt(document.getElementById("speed").value);
    let volume = parseInt(document.getElementById("volume").value) / 100;

    let audioBuffer = await generateMorseAudioBuffer(text, tone, wpm, volume);
    let wavBlob = bufferToWave(audioBuffer, audioBuffer.length);
    let url = URL.createObjectURL(wavBlob);

    let now = new Date();
    let filename = `dyyzmorseplayer-${now.toISOString().replace(/[-:T]/g, "").slice(0, 14)}.wav`;

    let a = document.createElement("a");
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);

    alert(`Download berhasil: ${filename}`);
}