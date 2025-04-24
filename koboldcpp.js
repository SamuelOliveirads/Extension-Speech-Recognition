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

    async processAudio(audioBlob) {
        const base64WithPrefix = await getBase64Async(audioBlob);
    
        const base64Audio = base64WithPrefix.split(',')[1];
    
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
        const url = `${server}/api/extra/transcribe`;

        const apiResult = await fetch(url, {
        method: 'POST',
        headers,
        body: JSON.stringify(payload),
        });

        if (!apiResult.ok) {
        const txt = await apiResult.text();
        toastr.error(txt, 'STT Generation Failed (KoboldCpp)', {
            timeOut: 10000,
            extendedTimeOut: 20000,
            preventDuplicates: true
        });
        throw new Error(`HTTP ${apiResult.status}: ${txt}`);
        }

        const result = await apiResult.json();
        return result.text;
    }
}
