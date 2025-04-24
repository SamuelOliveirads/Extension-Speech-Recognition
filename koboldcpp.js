import { textgenerationwebui_settings, textgen_types } from '../../../textgen-settings.js';
import { getRequestHeaders } from '../../../../script.js';
import { getBase64Async } from '../../../utils.js';
export { KoboldCppSttProvider };

const DEBUG_PREFIX = '<Speech Recognition module (KoboldCpp)> ';

class KoboldCppSttProvider {
    //########//
    // Config //
    //########//

    settings;

    defaultSettings = {
        language: '',
    };

    get settingsHtml() {
        let html = '<div>Requires KoboldCpp 1.67 or later. See the ';
        html += '<a href="https://github.com/LostRuins/koboldcpp/releases/tag/v1.67" ';
        html += 'target="_blank">release notes</a> for more information.</div>';
        html += '<div><i>Hint: Set KoboldCpp URL in the API connection settings ';
        html += '(under Text Completion!)</i></div>';
        return html;
    }

    onSettingsChange() {
        // Used when provider settings are updated from UI
    }

    loadSettings(settings) {
        // Populate Provider UI given input settings
        if (Object.keys(settings).length == 0) {
            console.debug(DEBUG_PREFIX + 'Using default KoboldCpp STT extension settings');
        }

        // Only accept keys defined in defaultSettings
        this.settings = this.defaultSettings;

        for (const key in settings) {
            if (key in this.settings) {
                this.settings[key] = settings[key];
            } else {
                throw `Invalid setting passed to STT extension: ${key}`;
            }
        }

        $('#speech_recognition_language').val(this.settings.language);
        console.debug(DEBUG_PREFIX + 'KoboldCpp STT settings loaded');
    }

    // --- Helper: encode AudioBuffer como WAV PCM16 LE @16 000Hz ---
    encodeWAV(buffer) {
        const numChan = buffer.numberOfChannels;
        const length  = buffer.length * numChan * 2 + 44;
        const view    = new DataView(new ArrayBuffer(length));
        let offset    = 0;
        const writeString = s => {
          for (let i = 0; i < s.length; i++) {
            view.setUint8(offset++, s.charCodeAt(i));
          }
        };
    
        // RIFF header
        writeString('RIFF');
        view.setUint32(offset, length - 8, true); offset += 4;
        writeString('WAVE');
        // fmt subchunk
        writeString('fmt ');
        view.setUint32(offset, 16, true); offset += 4;       // Subchunk1Size
        view.setUint16(offset, 1, true);  offset += 2;       // PCM
        view.setUint16(offset, numChan, true); offset += 2;   // NumChannels
        view.setUint32(offset, 16000, true); offset += 4;     // SampleRate
        const byteRate = 16000 * numChan * 2;
        view.setUint32(offset, byteRate, true); offset += 4;  // ByteRate
        view.setUint16(offset, numChan * 2, true); offset += 2; // BlockAlign
        view.setUint16(offset, 16, true); offset += 2;        // BitsPerSample
        // data subchunk
        writeString('data');
        view.setUint32(offset, buffer.length * numChan * 2, true);
        offset += 4;
    
        const interleaved = new Float32Array(buffer.length * numChan);
        for (let ch = 0; ch < numChan; ch++) {
          buffer.getChannelData(ch).forEach((v, i) => {
            interleaved[i * numChan + ch] = v;
          });
        }
        for (let i = 0; i < interleaved.length; i++, offset += 2) {
          let s = Math.max(-1, Math.min(1, interleaved[i]));
          view.setInt16(offset, s < 0 ? s * 0x8000 : s * 0x7FFF, true);
        }
    
        return view.buffer;
      }
    
      async resampleTo16kWav(blob) {
        const origBuf = await blob.arrayBuffer();
        const ctx     = new AudioContext();
        const audio   = await ctx.decodeAudioData(origBuf);
    
        const offCtx = new OfflineAudioContext(
          audio.numberOfChannels,
          Math.ceil(audio.duration * 16000),
          16000
        );
        const src = offCtx.createBufferSource();
        src.buffer = audio;
        src.connect(offCtx.destination);
        src.start(0);
        const rendered = await offCtx.startRendering();
    
        const wavBuffer = this.encodeWAV(rendered);
        return new Blob([wavBuffer], { type: 'audio/wav' });
    }

    async processAudio(audioBlob) {
      const wav16kBlob = await this.resampleTo16kWav(audioBlob);
  
      const dataUrl     = await getBase64Async(wav16kBlob);
      const base64Audio = dataUrl.split(',')[1];
  
      const payload = {
        prompt:              '',
        suppress_non_speech: false,
        langcode:            this.settings.language || 'auto',
        audio_data:          base64Audio,
      };
  
      const headers = getRequestHeaders();
      headers['Content-Type'] = 'application/json';
  
      const server = textgenerationwebui_settings
                          .server_urls[textgen_types.KOBOLDCPP];
      const url       = `${server}extra/transcribe`;
  
      console.debug(DEBUG_PREFIX, 'Calling STT at:', url);
  
      const apiResult = await fetch(url, {
        method: 'POST',
        headers,
        body: JSON.stringify(payload),
      });
  
      if (!apiResult.ok) {
        const txt = await apiResult.text();
        toastr.error(txt, 'STT Generation Failed (KoboldCpp)', {
          timeOut:         10000,
          extendedTimeOut: 20000,
          preventDuplicates: true
        });
        throw new Error(`HTTP ${apiResult.status}: ${txt}`);
      }
  
      const result = await apiResult.json();
      return result.text;
    }
  }
  