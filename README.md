
# w-AI-fu - AI Waifu / VTuber

***This program currently requires having a [NovelAI](https://novelai.net/) account in order to work. These are not free and go from 10$ to 25$ a month. You can still try out the program using a free-tier account, but be aware that it will stop working after 100 responses.***

## INSTALL w-AI-fu

Before running w-AI-fu, follow these steps:

1. Install [NodeJS](https://nodejs.org/en/download/releases) (prefer v19.8.1)
2. Install [Python](https://www.python.org/downloads/) (prefer 3.10.10)
3. Run INSTALL.bat in order to install dependencies
4. Put your [NovelAI](https://novelai.net/) account email/password in the 'auth\novel_user.txt' and 'auth\novel_pass.txt' respectivly
5. (Not required, only for twitch) Put a Twitch [Oauth token](https://twitchapps.com/tmi/) (without the 'oauth:' part) inside of 'auth\twitch_oauth.txt'
6. (Not required, only for twitch) In config.json, set read_chat_live to true and twitch_channel_name to the name of your channel.

You can now use w-AI-fu!
Use the 'run.bat' file or the 'Run w-AI-fu' shortcut to run the program.




## CONFIGURATION

In order to modify the default behaviour of w-AI-fu,
you will need to modify the 'config.json' file.

Here are the available parameters and their function:

### character_name

	Changes which character to load when opening the application.
	For exemple, if character_name is set to "Hilda", w-AI-fu will
	look for 'Hilda.json' in 'w-AI-fu\characters\'.

### user_name

	Sets the name of the user (not chat nor chat user) that will be
	used by the character to identify you.

### is_voice_input

	Either false or true.
	If true, w-AI-fu will continuously listen for audio input from the
	default microphone.
	Text input is still available when voice input is on.

### read_chat_live

	Will activate the ability for the character to read and respond
	to live chat messages from a set twitch channel defined by
	twitch_channel_name.
	The chat message will be read after waiting for x seconds defined
	by chat_read_timeout_sec.
	Any voice/text input by the user will reset this timer.

### chat_read_timeout_sec

	Number of seconds without user input the character needs to wait before
	reading a single chat message.
	No effect if read_chat_live is off.

### twitch_channel_name

	Name of the twitch channel from which the messages should be read.
	If the url of your channel is: https://www.twitch.tv/###
	then the content of twitch_channel_name should be ###

### filter_bad_words

	Either false or true.
	Will filter bad words from the generated responses if a word or expression
	is found inside of 'w-AI-fu\bad_words\bad_words.txt'.
	The provided list is empty as to not encourage people to try and find
	work-arounds.




## CHARACTERS

To generate a new character, go to the 'w-AI-fu\characters\creator\' folder.
In this folder, you will find multiple .txt files:

### name.txt:

	This will change the name of the character. The generated character file
	will be the name of the character followed by '.json'.

### user_name.txt:

	What the character should call the user.

### description.txt

	Short description of the character, should not be longer than a few sentences.
	This will give context on the character's role to the LLM.

### personality.txt

	Prompt preface used to give context, relevant informations and force a formating style to the response.
	Here is how this file should be formated:
	
	{{User name}}: {{Question or statement}}
	{{Character name}}: {{Response}}

	The content of the file should be several lines long and give a maximum amount of context on the character.
	Do not use new lines unless when a new person is speaking.
	{{User name}} should be the same as the contents of 'user_name.txt'
	{{Character name}} should be the same as the contents of 'name.txt'

### voice.txt

	Single word used as a seed by the TTS in order to generate a voice.

To generate the character file, run the 'char_creator.bat' file. The resulting file will be present in the 'w-AI-fu\characters\' folder.
