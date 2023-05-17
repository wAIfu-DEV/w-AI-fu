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
     * @param {string} signal 
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

let config = {};
let chara = {};
let chars_list = [];
let audio_devices = {};
let version = '';
let last_username = '';
let prevent_send = false;

(async function() {
    console.log('%c⚠️ DO NOT COPY ANYTHING IN THIS CONSOLE ⚠️\nCopying and pasting scripts here might expose your confidential informations or modify the configuration of w-AI-fu for nefarious reasons.\n', 'color: rgb(255, 0, 0);background-color: rgb(0, 0, 0)');
    await getAuth();
    await getLatest();
    stillAlive();
})();

const stillAlive = async() => {
    try {
        let resp = await fetch('http://127.0.0.1:7860/alive');
        await resp.text();
    } catch(e) {
        window.close();
    }
    setTimeout(stillAlive, 5 * 1000);
}

DOM.query('ConsoleInputField').on('keydown', (ke) => {
    if (ke.code !== 'Enter') return;
    ke.preventDefault();
    sendInput();
});

DOM.queryAll('input[auth]').forEach((obj) => {
    obj.on('change', async() => {
        const json_obj = {
            "novel-mail": getValueById("novel-mail"),
            "novel-pass": getValueById("novel-pass"),
            "twitch-oauth": getValueById("twitch-oauth"),
            "playht-auth": getValueById("playht-auth"),
            "playht-user": getValueById("playht-user")
        }

        const resp = await fetch('http://127.0.0.1:7860/setauth', {
            method: 'POST',
            headers: {
                "Content-Type": "application/json"
            },
            body: JSON.stringify(json_obj)
        });
        const data = await resp.text();
    });
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

DOM.query('CharacterSaveButton').on('click', async() => {
    const new_chara = {
        "char_name": DOM.getId('char_name').get('textContent'), 
        "char_persona": DOM.getId('char_desc').get('innerHTML').replaceAll('<br>', '\n'),
        "example_dialogue": DOM.getId('char_exd').get('innerHTML').replaceAll('<br>', '\n'),
        "voice": DOM.getId('char_voice').get('textContent'),
        "topics": DOM.getId('char_topics').get('textContent').split(/, |,/g).filter((v) => v !== undefined && v !== ''),
        "craziness": Number(DOM.getId('craziness').get('value')),
        "creativity": Number(DOM.getId('creativity').get('value'))
    };
    const resp = await fetch('http://127.0.0.1:7860/savechar', {
        method: 'POST',
        headers: {
            "Content-Type": "application/json"
        },
        body: JSON.stringify(new_chara)
    });
    const data = await resp.text();
    await setConfig('character_name', new_chara.char_name);
    await getLatest();
});

DOM.query('CharacterDownloadButton').on('click', () => {
    const new_chara = {
        "char_name": DOM.getId('char_name').get('textContent'), 
        "char_persona": DOM.getId('char_desc').get('innerHTML').replaceAll('<br>', '\n'),
        "example_dialogue": DOM.getId('char_exd').get('innerHTML').replaceAll('<br>', '\n'),
        "voice": DOM.getId('char_voice').get('textContent'),
        "topics": DOM.getId('char_topics').get('textContent').split(/, |,/g).filter((v) => v !== undefined && v !== ''),
        "craziness": Number(DOM.getId('craziness').get('value')),
        "creativity": Number(DOM.getId('creativity').get('value'))
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

DOM.query('FlipFlop[config="tts_use_playht"]').self((ref) => {
    ref.on('click', () => {
        flipFlipFlop(ref.element);
        setConfig(ref.element.getAttribute('config'), (ref.element.getAttribute('value') !== 'NovelAI'))
    });
});

DOM.query('DisplayAuthButton').self((ref) => {
    ref.on('click', () => {
        const authsec = document.querySelector('Auth');
        if (authsec.style.display !== 'none') {
            authsec.style.display = 'none';
            ref.set('textContent', 'Expand ▾');
        }
        else if (confirm('This section should never be on screen while live,\nare you sure you want to continue?')) {
            authsec.style.display = 'block';
            ref.set('textContent', 'Shrink ▴');
            setTimeout(window.scrollTo(0, document.body.scrollHeight),0);
        }
    });
});

const nb_s = document.querySelector('input[config="chat_read_timeout_sec"]');
nb_s.addEventListener('change', () => {
    if (nb_s.value === '') return;
    setConfig(nb_s.getAttribute('config'), Number(nb_s.value));
});

const ld_ch = document.getElementById('loaded-char');
ld_ch.addEventListener('change', () => {
    setConfig('character_name', ld_ch.value);
});

async function getLatest() {
    const resp = await fetch('http://127.0.0.1:7860/latest');
    const data = await resp.json();
    config = data["config"];
    chara = data["character"];
    chars_list = data["chars_list"];
    version = data["version"];
    audio_devices = data["audio_devices"];
    setLatestData();
}

async function getAuth() {
    const resp = await fetch('http://127.0.0.1:7860/getauth');
    const data = await resp.json();
    
    setValueById('novel-mail', data['novel-mail']);
    setValueById('novel-pass', data['novel-pass']);
    setValueById('twitch-oauth', data['twitch-oauth']);
    setValueById('playht-auth', data['playht-auth']);
    setValueById('playht-user', data['playht-user']);
}

async function sendCommand(text) {
    await fetch('http://127.0.0.1:7860/command', {
        method: 'POST',
        headers: {
            "Content-Type": "text/plain"
        },
        body: text
    });
}

function clearConsole() {
    const view = document.querySelector('ConsoleView');
    view.innerHTML = '';
}

async function sendInput() {
    if (prevent_send === true) return;
    const inputbox = document.querySelector('ConsoleInputField');
    const input_data = inputbox.textContent;

    inputbox.textContent = '';

    if (input_data === null) return;
    if (input_data === '') return;

    const cnf = document.querySelector('ConsoleNameField');

    if (cnf.textContent !== last_username) {
        await setConfig('user_name', cnf.textContent);
        last_username = cnf.textContent;
    }

    addConsoleBubble(true, input_data);
    
    const temp_bubble = addConsoleBubble(false, '•••');

    prevent_send = true;

    const resp = await fetch('http://127.0.0.1:7860/input', {
        method: 'POST',
        headers: {
            "Content-Type": "text/plain"
        },
        body: input_data
    });
    const data = await resp.json();

    temp_bubble.parentElement.removeChild(temp_bubble);

    if (data["filtered"] !== null) {
        addFilteredBubble(data["filtered"]);
    }
    else
        addConsoleBubble(false, data["text"]);
    
    prevent_send = false;
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

function addFilteredBubble(filtered) {
    const view = document.querySelector('ConsoleView');
    view.innerHTML +=
        `<ConsoleBubbleFiltered>
            [ FILTERED ]
            <p>${filtered.trim()}</p>
            <FilteredOptionsButton onclick="sendCommand(\'!say ${filtered.trim().replaceAll(/[^a-zA-Z,.!? 0-9]/g, '')}\');">
                Unfilter
            </FilteredOptionsButton>
        </ConsoleBubbleFiltered>`;
    view.scrollTo(0, view.scrollHeight);
}

async function setConfig(name, value) {
    await fetch('http://127.0.0.1:7860/config', {
        method: 'POST',
        headers: {
            "Content-Type": "application/json"
        },
        body: JSON.stringify({"name": name, "value": value})
    });
}

function setLatestData() {
    setTextByQuery('ConsoleNameField', config.user_name);
    /*const a = document.querySelector('ConsoleNameField');
    a.textContent = config.user_name;*/
    last_username = config.user_name;
    const b = document.getElementById('loaded-char');
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
    const h = document.querySelector('FlipFlop[config="is_voice_input"]');
    h.textContent = (config.is_voice_input) ? 'on' : 'off';
    h.setAttribute('value', h.textContent);
    const i = document.querySelector('FlipFlop[config="read_live_chat"]');
    i.textContent = (config.read_live_chat) ? 'on' : 'off';
    i.setAttribute('value', i.textContent);
    const j = document.querySelector('FlipFlop[config="tts_use_playht"]');
    j.textContent = (config.tts_use_playht) ? 'Play.ht' : 'NovelAI';
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
    const n = document.querySelector('VersionString');
    n.textContent = version;
    const o = document.getElementById('twitch-name');
    o.value = config.twitch_channel_name;
    const p = document.getElementById('audio-device');
    for(let s in audio_devices) {
        if (audio_devices[s] !== config.audio_device) {
            p.innerHTML += `<option>${s}</option>`;
        } else {
            p.innerHTML = `<option>${s}</option>` + p.innerHTML 
        }
    }
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
    fetch('http://127.0.0.1:7860/interrupt');
}