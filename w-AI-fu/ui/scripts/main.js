"use strict";

class DOMobject {
    /** @type {HTMLElement} */
    element;
    /** @param {HTMLElement | null} html_element */
    constructor(html_element) {
        if (html_element === null)
            throw new Error('Cannot get DOMobject from null.');
        this.element = html_element;
        return this;
    }
    /** 
     * @returns {DOMobject} 
     * @param {string} property
     * @param {any} value */
    set(property, value) {
        if (this.element[property] === undefined)
            throw new Error(`Cannot set unexistant property ${property} in DOMobject.`);
        this.element[property] = value;
        return this;
    }
    /**
     * @returns {any}
     * @param {string} property */
    get(property) {
        if (this.element[property] === undefined)
            throw new Error(`Cannot get value of unexistant property ${property} in DOMobject.`);
        return this.element[property];
    }
    /**
     * @returns {void}
     * @param {'click'|'change'|'input'} signal 
     * @param {EventListenerOrEventListenerObject} callback */
    on(signal, callback) {
        this.element.addEventListener(signal, callback);
    }
    /**
     * @returns {DOMobject}
     * @param {(ref: DOMobject) => any} callback*/
    self(callback) {
        callback(this);
        return this;
    }
}

class DOM {
    /**
     * @returns {DOMobject}
     * @param {string} look_for */
    static query(look_for) { return new DOMobject(document.querySelector(look_for)); }
    /**
     * @returns {DOMobject}
     * @param {string} look_for */
    static getId(id) { return new DOMobject(document.getElementById(id)); }
    /**
     * @returns {DOMobject[]}
     * @param {string} look_for */
    static queryAll(look_for) {
        /** @type {DOMobject[]} */
        let result = [];
        document.querySelectorAll(look_for).forEach((e) => result.push(new DOMobject(e)));
        return result;
    }
}

/** @type {WebSocket} */
const ws = new WebSocket('ws://127.0.0.1:7770');
let config = {};
let chara = {};
let auth = {};
let chars_list = [];
let audio_devices = {};
let version = '';
let last_username = '';
let prevent_send = false;

(async function() {
    console.log('%c⚠️ DO NOT COPY ANYTHING IN THIS CONSOLE ⚠️\nCopying and pasting scripts here might expose your confidential informations or modify the configuration of w-AI-fu for nefarious reasons.\n', 'color: rgb(255, 0, 0);background-color: rgb(0, 0, 0)');

    ws.onopen = async() => {
        ws.onmessage = (data) => handleSocketMessage(data.data);

        await getAuth();
        await getLatest();
    };

    ws.onclose = () => {
        document.title = "Error";
        alert('Could not reach the w-AI-fu application, it may have been closed.');
        throw new Error('Unable to contact core NodeJS application server.');
    }
})();

async function handleSocketMessage(data) {
    const message = String(data);
    let type = message.split(' ')[0];
    if (type === undefined) type = message;
    const payload = (type.length === message.length)
                    ? ''
                    : message.substring(type.length + 1, undefined);
    switch (type) {
        case 'MSG_IN': {
            addConsoleBubble(true, payload);
            return;
        }
        case 'MSG_CHAT': {
            addChatBubble(payload);
            return;
        }
        case 'MSG_OUT': {
            const data = JSON.parse(payload);
            if (data["filtered"] !== null) {
                addFilteredBubble(data["filtered"], data["text"]);
            }
            else
                addConsoleBubble(false, data["text"]);
            return;
        }
        case 'ERROR': {
            addErrorBubble(payload);
            return;
        }
        case 'AUTH': {
            ws.dispatchEvent(new CustomEvent('auth', {detail: JSON.parse(payload)}));
            return;
        }
        case 'LATEST': {
            ws.dispatchEvent(new CustomEvent('latest', {detail: JSON.parse(payload)}));
            return;
        }
        default:
            return;
    };
}

DOM.getId('consolebut-pause').self(ref => {
    ref.on('click', () => {
        ws.send('PAUSE');

        if (ref.element.classList.contains('BigRedButton')) {
            ref.element.classList.remove('BigRedButton');
        } else {
            ref.element.classList.add('BigRedButton');
        }
    });
});

DOM.query('ConsoleInputField').on('keydown', (ke) => {
    if (ke.code !== 'Enter') return;
    ke.preventDefault();
    sendInput();
});

DOM.query('AuthSaveButton').on('click', () => {
    auth = {
        "novel-mail": getValueById("novel-mail"),
        "novel-pass": getValueById("novel-pass"),
        "twitch-oauth": getValueById("twitch-oauth"),
        "twitchapp-clientid": getValueById("twitchapp-clientid"),
        "twitchapp-secret": getValueById("twitchapp-secret"),
        /*"playht-auth": getValueById("playht-auth"),
        "playht-user": getValueById("playht-user")*/
    }
    ws.send('AUTH_SET ' + JSON.stringify(auth));
    ws.send('CONFIG ' + JSON.stringify(config));
});

DOM.getId('craziness').self((ref) => {
    ref.on('input', () => {
        DOM.getId('craziness-label').set('textContent', ref.get('value'));
    });
});

DOM.getId('creativity').self((ref) => {
    ref.on('input', () => {
        DOM.getId('creativity-label').set('textContent', ref.get('value'));
    });
});

DOM.getId('output-length').self((ref) => {
    ref.on('input', () => {
        DOM.getId('output-length-label').set('textContent', ref.get('value'));
    });
});

DOM.getId('randomize-voice-seed').self((ref) => {
    ref.on('click', () => {
        const letters = 'abcdefghijklmnopqrstuvwxyz';
        let rdm_seed = '';
        let bound = Math.ceil(Math.random() * 15);
        for (let i = 0; i < bound; i++)
            rdm_seed += letters[Math.floor(Math.random() * letters.length)];
        DOM.getId('char_voice').set('textContent', rdm_seed);
    });
});

DOM.getId('test-audio').self((ref) => {
    ref.on('click', () => {
        sendCommand('!testaudio ' + Number(audio_devices[DOM.getId('audio-device').get('value')]) + '###This is a test.');
    });
});

DOM.getId('test-audio-other').self((ref) => {
    ref.on('click', () => {
        sendCommand('!testaudio ' + Number(audio_devices[DOM.getId('audio-device-other').get('value')]) + '###This is a test.');
    });
});

DOM.getId('test-voice').self((ref) => {
    ref.on('click', () => {

        let test_text = 'This is a test. Is this the one?';
        
        // Easter egg btw
        let rdm = Math.random();
        if (rdm <= 0.015) {
            test_text = 'I AM LIVING IN YOUR WALLS, I AM WATCHING YOU!!!!!!!!!!!!!!!!!!!!!!!!!!';
        }

        sendCommand(`!testvoice ${ DOM.getId('char_voice').get('textContent') }###${test_text}`);
    });
});

DOM.query('CharacterSaveButton').on('click', async() => {
    const new_chara = {
        "char_name": DOM.getId('char_name').get('textContent'),
        "char_persona": DOM.getId('char_desc').get('innerHTML').replaceAll('<br>', '\n').replaceAll(/\<\/.*?\>/g, '\n').replaceAll(/\<.*?\>/g, '').replaceAll(/&[^ \n\t]+?;/g, '').replaceAll(/\n+/g, '\n'),
        "example_dialogue": DOM.getId('char_exd').get('innerHTML').replaceAll('<br>', '\n').replaceAll(/\<\/.*?\>/g, '\n').replaceAll(/\<.*?\>/g, '').replaceAll(/&[^ \n\t]+?;/g, '').replaceAll(/\n+/g, '\n'),
        "voice": DOM.getId('char_voice').get('textContent'),
        "topics": DOM.getId('char_topics').get('textContent').split(/, |,/g).filter((v) => v !== undefined && v !== ''),
        "craziness": Number(DOM.getId('craziness').get('value')),
        "creativity": Number(DOM.getId('creativity').get('value')),
        "max_output_length": Number(DOM.getId('output-length').get('value'))
    };
    ws.send('CHARA ' + JSON.stringify(new_chara));
    setConfig('character_name', new_chara.char_name);
    await getLatest();
});

DOM.query('CharacterDownloadButton').on('click', () => {
    const new_chara = {
        "char_name": DOM.getId('char_name').get('textContent'), 
        "char_persona": DOM.getId('char_desc').get('innerHTML').replaceAll('<br>', '\n').replaceAll(/\<\/.*?\>/g, '\n').replaceAll(/\<.*?\>/g, '').replaceAll(/&[^ \n\t]+?;/g, '').replaceAll(/\n+/g, '\n'),
        "example_dialogue": DOM.getId('char_exd').get('innerHTML').replaceAll('<br>', '\n').replaceAll(/\<\/.*?\>/g, '\n').replaceAll(/\<.*?\>/g, '').replaceAll(/&[^ \n\t]+?;/g, '').replaceAll(/\n+/g, '\n'),
        "voice": DOM.getId('char_voice').get('textContent'),
        "topics": DOM.getId('char_topics').get('textContent').split(/, |,/g).filter((v) => v !== undefined && v !== ''),
        "craziness": Number(DOM.getId('craziness').get('value')),
        "creativity": Number(DOM.getId('creativity').get('value')),
        "max_output_length": Number(DOM.getId('output-length').get('value'))
    };
    download(new_chara.char_name + '.json', JSON.stringify(new_chara));
});

DOM.queryAll('FlipFlop').forEach((obj) => {
    if (obj.element.hasAttribute('standalone')) return;
    obj.on('click', () => {
        flipFlipFlop(obj.element);
        setConfig(obj.element.getAttribute('config'), obj.element.getAttribute('value'));
    });
});

DOM.getId('twitch-name').self((ref) => {
    ref.on('change', () => {
        setConfig('twitch_channel_name', ref.get('value'));
    });
});

DOM.getId('audio-device').self((ref) => {
    ref.on('change', () => {
        setConfig('audio_device', Number(audio_devices[ref.get('value')]));
    });
});

DOM.getId('audio-device-other').self((ref) => {
    ref.on('change', () => {
        setConfig('audio_device_other', Number(audio_devices[ref.get('value')]));
    });
});

DOM.query('FlipFlop[config="tts_use_playht"]').self((ref) => {
    ref.on('click', () => {
        flipFlipFlop(ref.element);
        setConfig(ref.element.getAttribute('config'), (ref.element.getAttribute('value') !== 'NovelAI'))
    });
});

function showAuth(ref) {
    const authsec = document.querySelector('Auth');
    if (confirm('This section should never be on screen while live,\nare you sure you want to continue?')) {
        authsec.style.display = 'block';
        ref.set('textContent', 'Shrink ▴');
        setTimeout(window.scrollTo(0, document.body.scrollHeight),0);
    }
}

function hideAuth(ref) {
    const authsec = document.querySelector('Auth');
    authsec.style.display = 'none';
    ref.set('textContent', 'Expand ▾');
}

DOM.query('DisplayAuthButton').self((ref) => {
    ref.on('click', () => {
        const authsec = document.querySelector('Auth');
        if (authsec.style.display !== 'none') {
            hideAuth(ref);
        } else {
            showAuth(ref);
        }
    });
});

DOM.query('ConfigSaveButton').self(ref => {
    ref.on('click', () => {
        setConfig('chatter_blacklist', String(DOM.getId('chatter-blacklist').get('textContent'))
                                        .split(',')
                                        .map(value => value.trim())
                                        .filter(value => (value === '' || value === undefined) === false));
        
        ws.send('CONFIG ' + JSON.stringify(config));
    });
});

DOM.query('input[config="monologue_chance"]').self(ref => {
    ref.on('change', () => {
        if (ref.get('value') === '') return;
        setConfig(ref.element.getAttribute('config'), Number(ref.get('value')));
    });
});

DOM.query('input[config="tts_volume_modifier"]').self(ref => {
    ref.on('change', () => {
        if (ref.get('value') === '') return;
        setConfig(ref.element.getAttribute('config'), Number(ref.get('value')));
    });
});

DOM.getId('nav-console').on('click', () => {
    hideAuth(DOM.query('DisplayAuthButton'));
    DOM.queryAll('section[class="page"]').forEach(page => {
        if (page.element.id === 'console-section') {
            page.element.style.display = "block";
        } else {
            page.element.style.display = "none";
        }
    });
});

DOM.getId('nav-config').on('click', () => {
    hideAuth(DOM.query('DisplayAuthButton'));
    DOM.queryAll('section[class="page"]').forEach(page => {
        if (page.element.id === 'configuration-section') {
            page.element.style.display = "block";
        } else {
            page.element.style.display = "none";
        }
    });
});

DOM.getId('nav-chara').on('click', () => {
    hideAuth(DOM.query('DisplayAuthButton'));
    DOM.queryAll('section[class="page"]').forEach(page => {
        if (page.element.id === 'character-section') {
            page.element.style.display = "block";
        } else {
            page.element.style.display = "none";
        }
    });
});

DOM.getId('nav-chara').on('click', () => {
    hideAuth(DOM.query('DisplayAuthButton'));
    DOM.queryAll('section[class="page"]').forEach(page => {
        if (page.element.id === 'character-section') {
            page.element.style.display = "block";
        } else {
            page.element.style.display = "none";
        }
    });
});

DOM.getId('nav-account').on('click', () => {
    hideAuth(DOM.query('DisplayAuthButton'));
    DOM.queryAll('section[class="page"]').forEach(page => {
        if (page.element.id === 'accounts-section') {
            page.element.style.display = "block";
        } else {
            page.element.style.display = "none";
        }
    })
});

const nb_s = document.querySelector('input[config="chat_read_timeout_sec"]');
nb_s.addEventListener('change', () => {
    if (nb_s.value === '') return;
    setConfig(nb_s.getAttribute('config'), Number(nb_s.value));
});

const ld_ch = document.getElementById('loaded-char');
ld_ch.addEventListener('change', () => {
    setConfig('character_name', ld_ch.value);
    ws.send('CONFIG ' + JSON.stringify(config));
    getLatest();
});

async function getLatest() {
    return new Promise((resolve) => {
        const el = (e) => {
            const data = e.detail;
            config = data["config"];
            chara = data["character"];
            chars_list = data["chars_list"];
            version = data["version"];
            audio_devices = data["audio_devices"];
            setLatestData();
            ws.removeEventListener('latest', el);
            resolve();
        };
        ws.addEventListener('latest', el);
        ws.send('LATEST');
    });
}

async function getAuth() {
    return new Promise((resolve) => {
        const el = (e) => {
            const data = e.detail;
            setValueById('novel-mail', data['novel-mail']);
            setValueById('novel-pass', data['novel-pass']);
            setValueById('twitch-oauth', data['twitch-oauth']);
            setValueById('twitchapp-clientid', data['twitchapp-clientid']);
            setValueById('twitchapp-secret', data['twitchapp-secret']);
            /*setValueById('playht-auth', data['playht-auth']);
            setValueById('playht-user', data['playht-user']);*/
            ws.removeEventListener('auth', el);
            resolve();
        };
        ws.addEventListener('auth', el);
        ws.send('AUTH_GET');
    });
}

async function sendCommand(text) {
    ws.send('MSG ' + text);
}

function clearConsole() {
    const view = document.querySelector('ConsoleView');
    view.innerHTML = '';
}

async function sendInput() {
    if (verifyAuth() === false) return;
    if (prevent_send === true) return;
    const inputbox = document.querySelector('ConsoleInputField');
    const input_data = inputbox.textContent;

    inputbox.textContent = '';

    if (input_data === null) return;
    if (input_data === '') return;

    const cnf = document.querySelector('ConsoleNameField');

    if (cnf.textContent !== last_username) {
        setConfig('user_name', cnf.textContent);
        last_username = cnf.textContent;
        ws.send('CONFIG ' + JSON.stringify(config));
    }

    ws.send('MSG ' + input_data);
}

function addConsoleBubble(input, text) {
    const view = document.querySelector('ConsoleView');
    const a = document.createElement('ConsoleViewSection');
    const b = document.createElement((input) ? 'ConsoleBubbleIn' : 'ConsoleBubbleOut');

    b.textContent = text;

    a.appendChild(b);
    view.appendChild(a);

    view.scrollTo(0, view.scrollHeight);
    return a;
}

function addFilteredBubble(filtered, text) {
    const view = document.querySelector('ConsoleView');
    view.innerHTML +=
        `<ConsoleViewSection>
            <ConsoleBubbleFiltered>
                [ FILTERED ]
                <span>
                    <p class="short-p">${filtered.join(', ')}</p> in
                </span>
                <p>${text.trim()}</p>
                <FilteredOptionsButton onclick="ws.send('INTERRUPT');sendCommand(\'!say ${text.trim().replaceAll(/[^a-zA-Z,.!? 0-9]/g, '')}\');">
                    Unfilter
                </FilteredOptionsButton>
            </ConsoleBubbleFiltered>
        </ConsoleViewSection>`;
    view.scrollTo(0, view.scrollHeight);
}

function addErrorBubble(error) {
    const view = document.querySelector('ConsoleView');
    const viewsec = document.createElement('ConsoleViewSection');
    const viewbb = document.createElement('ConsoleBubbleError');
    const bbp = document.createElement('p');

    view.appendChild(viewsec);
    viewsec.appendChild(viewbb);
    viewbb.textContent = '[ ERROR ]';
    viewbb.appendChild(bbp);
    bbp.textContent = error.trim();
    view.scrollTo(0, view.scrollHeight);
}

function addChatBubble(message) {
    const data = JSON.parse(message);

    const view = document.querySelector('ConsoleView');
    const viewsec = document.createElement('ConsoleViewSection');
    const viewbb = document.createElement('ConsoleBubbleChat');
    const bbp = document.createElement('p');

    view.appendChild(viewsec);
    viewsec.appendChild(viewbb);
    viewbb.textContent = data.user;
    viewbb.appendChild(bbp);
    bbp.textContent = data.text.trim();

    view.scrollTo(0, view.scrollHeight);
}

function setConfig(name, value) {
    //ws.send('CONFIG ' + JSON.stringify({"name": name, "value": value}));
    if (value === "on") value = true;
    if (value === "off") value = false;
    config[name] = value;
}

function setLatestData() {
    setTextByQuery('ConsoleNameField', config.user_name);
    /*const a = document.querySelector('ConsoleNameField');
    a.textContent = config.user_name;*/
    last_username = config.user_name;
    const b = document.getElementById('loaded-char');
    document.title = `Control Panel ▸ ${chara.char_name}`
    b.innerHTML = `<option>${chara.char_name}</option>`;
    for(let s of chars_list) {
        let n = s.replace('.json','');
        if (n !== chara.char_name)
            b.innerHTML += `<option>${n}</option>`;
    }
    setTextById('char_name', chara.char_name);
    const d = document.getElementById('char_desc');
    d.innerHTML = chara.char_persona.replaceAll('\n','<br>');
    const e = document.getElementById('char_exd');
    e.innerHTML = chara.example_dialogue.replaceAll('\n','<br>');
    setTextById('char_voice', chara.voice);
    const g = document.getElementById('char_topics');
    g.textContent = '';
    for (let s of chara.topics) {
        g.textContent += s + ', ';
    }
    document.getElementById('craziness').value = chara.craziness;
    document.getElementById('craziness-label').textContent = String(chara.craziness);
    document.getElementById('creativity').value = chara.creativity;
    document.getElementById('creativity-label').textContent = String(chara.creativity);
    document.getElementById('output-length').value = chara.max_output_length;
    document.getElementById('output-length-label').textContent = String(chara.max_output_length);
    const h = document.querySelector('FlipFlop[config="is_voice_input"]');
    h.textContent = (config.is_voice_input) ? 'on' : 'off';
    h.setAttribute('value', h.textContent);
    const i = document.querySelector('FlipFlop[config="read_live_chat"]');
    i.textContent = (config.read_live_chat) ? 'on' : 'off';
    i.setAttribute('value', i.textContent);
    const j = document.querySelector('FlipFlop[config="tts_use_playht"]');
    j.textContent = /*(config.tts_use_playht) ? 'Play.ht' :*/ 'NovelAI';
    j.setAttribute('value', j.textContent);
    const k = document.querySelector('input[config="chat_read_timeout_sec"]');
    k.value = config.chat_read_timeout_sec;
    k.setAttribute('value', k.value);
    const l = document.querySelector('FlipFlop[config="filter_bad_words"]');
    l.textContent = (config.filter_bad_words) ? 'on' : 'off';
    l.setAttribute('value', l.textContent);
    const m = document.querySelector('FlipFlop[config="parrot_mode"]');
    m.textContent = (config.parrot_mode) ? 'on' : 'off';
    m.setAttribute('value', m.textContent);
    const m2 = document.querySelector('FlipFlop[config="monologue"]');
    m2.textContent = (config.monologue) ? 'on' : 'off';
    m2.setAttribute('value', m2.textContent);
    const n = document.querySelector('VersionString');
    n.textContent = version;
    const o = document.getElementById('twitch-name');
    o.value = config.twitch_channel_name;
    const p = document.getElementById('audio-device');
    for(let s in audio_devices) {
        if (config.audio_device === -1 && s === 'default') {
            p.innerHTML = `<option>${audio_devices[s]}</option>` + p.innerHTML 
        } else if (audio_devices[s] !== config.audio_device) {
            p.innerHTML += `<option>${s}</option>`;
        } else  {
            p.innerHTML = `<option>${s}</option>` + p.innerHTML 
        }
    }
    const q = document.getElementById('audio-device-other');
    for(let s in audio_devices) {
        if (config.audio_device_other === -1 && s === 'default') {
            q.innerHTML = `<option>${audio_devices[s]}</option>` + q.innerHTML 
        } else if (audio_devices[s] !== config.audio_device_other) {
            q.innerHTML += `<option>${s}</option>`;
        } else  {
            q.innerHTML = `<option>${s}</option>` + q.innerHTML 
        }
    }
    const r = document.getElementById('chatter-blacklist');
    for(let val of config.chatter_blacklist) {
        r.textContent += val + ', '
    }
    const s = document.querySelector('input[config="monologue_chance"]');
    s.value = config.monologue_chance;
    const t = document.querySelector('input[config="tts_volume_modifier"]');
    t.value = config.tts_volume_modifier;
}

function flipFlipFlop(element) {
    const flip = element.getAttribute('flip');
    const flop = element.getAttribute('flop');
    element.textContent = (element.textContent === flip) ? flop : flip;
    element.setAttribute('value', element.textContent);
}

function download(filename, text) {
    var element = document.createElement('a');
    element.setAttribute('href', 'data:text/plain;charset=utf-8,' + encodeURIComponent(text));
    element.setAttribute('download', filename);
  
    element.style.display = 'none';
    document.body.appendChild(element);
  
    element.click();
  
    document.body.removeChild(element);
}

function setValueById(id, value) {
    const ele = document.getElementById(id);
    if (ele === null) {
        throw new Error(`Tried to modify value of inexistant id: ${id}`);
    }
    if (ele.value === undefined) {
        throw new Error(`Cannot modify value of id: ${id}`);
    }
    ele.value = value;
    return ele;
}

function getValueById(id) {
    const ele = document.getElementById(id);
    if (ele === null) {
        throw new Error(`Tried to get value of inexistant id: ${id}`);
    }
    if (ele.value === undefined) {
        throw new Error(`Cannot get value of id: ${id}`);
    }
    return ele.value;
}

function setTextById(id, value) {
    const ele = document.getElementById(id);
    if (ele === null) {
        throw new Error(`Tried to modify textContent of inexistant id: ${id}`);
    }
    if (ele.textContent === undefined) {
        throw new Error(`Cannot modify textContent of id: ${id}`);
    }
    ele.textContent = value;
    return ele;
}

function getTextById(id) {
    const ele = document.getElementById(id);
    if (ele === null) {
        throw new Error(`Tried to get textContent of inexistant id: ${id}`);
    }
    if (ele.textContent === undefined) {
        throw new Error(`Cannot get textContent of id: ${id}`);
    }
    return ele.textContent;
}

function setTextByQuery(query, value) {
    const ele = document.querySelector(query);
    if (ele === null) {
        throw new Error(`Tried to modify textContent of inexistant: ${query}`);
    }
    if (ele.textContent === undefined) {
        throw new Error(`Cannot modify textContent of: ${query}`);
    }
    ele.textContent = value;
    return ele;
}

function getTextByQuery(query) {
    const ele = document.querySelector(query);
    if (ele === null) {
        throw new Error(`Tried to get textContent of inexistant: ${query}`);
    }
    if (ele.textContent === undefined) {
        throw new Error(`Cannot get textContent of: ${query}`);
    }
    return ele.textContent;
}

function interrupt() {
    ws.send('INTERRUPT');
}

function verifyAuth() {
    if (DOM.getId('novel-mail').get('value') === '') {
        addErrorBubble('Missing NovelAI mail from Authentification');
        return false;
    }
    if (DOM.getId('novel-pass').get('value') === '') {
        addErrorBubble('Missing NovelAI password from Authentification');
        return false;
    }

    if (config.read_live_chat === true) {
        if (DOM.getId('twitch-oauth').get('value') === '') {
            addErrorBubble('Missing Twitch oauth token from Authentification');
            return false;
        }
    }

    /*
    if (config.tts_use_playht === true) {
        if (DOM.getId('playht-auth').get('value') === '') {
            addErrorBubble('Missing Play.ht auth token from Authentification');
            return false;
        }
        if (DOM.getId('playht-user').get('value') === '') {
            addErrorBubble('Missing Play.ht user token from Authentification');
            return false;
        }
    }*/
    return true;
}