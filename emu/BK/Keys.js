export const bk0010_01 = {
    'СТОП': {
        triggerStopMode: true
    },

    'ПРОБЕЛ': {
        x: 4,
        y: 0,
        rightRegister: true
    },
    'СУ': {
        deviceControl: true
    },
    'АР2': {
        escape: true
    },
    'ЗАГЛ': {
        setCapital: true
    },
    'СТР': {
        setCapital: false
    },
    'ПР': {
        rightRegister: true
    },

    'ШАГ': {
        x: 0,
        y: 0
    },
    'ПОВТ': {
        x: 0,
        y: 1
    },
    'ИНД СУ': {
        x: 0,
        y: 2
    },
    'КТ': {
        x: 0,
        y: 3
    },
    'БЛОК РЕД': {
        x: 0,
        y: 4
    },

    'ВЛЕВО': {
        x: 1,
        y: 0
    },
    'ТАБ': {
        x: 1,
        y: 1
    },
    'ВВОД': {
        x: 1,
        y: 2
    },
    'СБРОС ЧАСТИ СТРОКИ': {
        x: 1,
        y: 3
    },
    'СБР': {
        x: 1,
        y: 4
    },
    'РУС': {
        x: 1,
        y: 6
    },
    'ЛАТ': {
        x: 1,
        y: 7
    },

    'ВС': {
        x: 2,
        y: 3
    },
    'СДВИЖКА В СТРОКЕ': {
        x: 2,
        y: 6
    },
    'РАЗДВИЖКА В СТРОКЕ': {
        x: 2,
        y: 7
    },

    'УДАЛЕНИЕ СИМВОЛА': {
        x: 3,
        y: 0
    },
    'ВПРАВО': {
        x: 3,
        y: 1
    },
    'ВВЕРХ': {
        x: 3,
        y: 2
    },
    'ВНИЗ': {
        x: 3,
        y: 3
    },

    '0': {
        x: 4,
        y: 0
    },
    '1': {
        x: 4,
        y: 1
    },
    '2': {
        x: 4,
        y: 2
    },
    '3': {
        x: 4,
        y: 3
    },
    '4': {
        x: 4,
        y: 4
    },
    '5': {
        x: 4,
        y: 5
    },
    '6': {
        x: 4,
        y: 6
    },
    '7': {
        x: 4,
        y: 7
    },

    '8': {
        x: 5,
        y: 0
    },
    '9': {
        x: 5,
        y: 1
    },
    ':': {
        x: 5,
        y: 2
    },
    ';': {
        x: 5,
        y: 3
    },
    ',': {
        x: 5,
        y: 4
    },
    '-': {
        x: 5,
        y: 5
    },
    '.': {
        x: 5,
        y: 6
    },
    '/': {
        x: 5,
        y: 7
    },

    'Ю': {
        x: 6,
        y: 0
    },
    'А': {
        x: 6,
        y: 1
    },
    'Б': {
        x: 6,
        y: 2
    },
    'Ц': {
        x: 6,
        y: 3
    },
    'Д': {
        x: 6,
        y: 4
    },
    'Е': {
        x: 6,
        y: 5
    },
    'Ф': {
        x: 6,
        y: 6
    },
    'Г': {
        x: 6,
        y: 7
    },

    'Х': {
        x: 7,
        y: 0
    },
    'И': {
        x: 7,
        y: 1
    },
    'Й': {
        x: 7,
        y: 2
    },
    'К': {
        x: 7,
        y: 3
    },
    'Л': {
        x: 7,
        y: 4
    },
    'М': {
        x: 7,
        y: 5
    },
    'Н': {
        x: 7,
        y: 6
    },
    'О': {
        x: 7,
        y: 7
    },

    'П': {
        x: 8,
        y: 0
    },
    'Я': {
        x: 8,
        y: 1
    },
    'Р': {
        x: 8,
        y: 2
    },
    'С': {
        x: 8,
        y: 3
    },
    'Т': {
        x: 8,
        y: 4
    },
    'У': {
        x: 8,
        y: 5
    },
    'Ж': {
        x: 8,
        y: 6
    },
    'В': {
        x: 8,
        y: 7
    },

    'Ь': {
        x: 9,
        y: 0
    },
    'Ы': {
        x: 9,
        y: 1
    },
    'З': {
        x: 9,
        y: 2
    },
    'Ш': {
        x: 9,
        y: 3
    },
    'Э': {
        x: 9,
        y: 4
    },
    'Щ': {
        x: 9,
        y: 5
    },
    'Ч': {
        x: 9,
        y: 6
    },
    'Ъ': {
        x: 9,
        y: 7
    }
}

export const webBk0010_01 = {
    'F12': {
        cpuReset: true
    },

    'Escape': bk0010_01['КТ'],
    'F1': bk0010_01['ПОВТ'],
    'F2': bk0010_01['КТ'],
    'F3': bk0010_01['СБРОС ЧАСТИ СТРОКИ'],
    'F4': bk0010_01['СДВИЖКА В СТРОКЕ'],
    'F5': bk0010_01['РАЗДВИЖКА В СТРОКЕ'],
    'F6': bk0010_01['ИНД СУ'],
    'F7': bk0010_01['БЛОК РЕД'],
    'F8': bk0010_01['ШАГ'],
    'F9': bk0010_01['СБР'],
    'F10': bk0010_01['СТОП'],

    'ShiftLeft': bk0010_01['ПР'],
    'ShiftRight': bk0010_01['ПР'],
    'IntlBackslash': bk0010_01[';'],
    'Digit1': bk0010_01['1'],
    'Digit2': bk0010_01['2'],
    'Digit3': bk0010_01['3'],
    'Digit4': bk0010_01['4'],
    'Digit5': bk0010_01['5'],
    'Digit6': bk0010_01['6'],
    'Digit7': bk0010_01['7'],
    'Digit8': bk0010_01['8'],
    'Digit9': bk0010_01['9'],
    'Digit0': bk0010_01['0'],
    'Minus': bk0010_01['-'],
    'Equal': bk0010_01['/'],
    'Backspace': bk0010_01['УДАЛЕНИЕ СИМВОЛА'],

    'Tab': bk0010_01['ТАБ'],
    'KeyQ': bk0010_01['Й'],
    'KeyW': bk0010_01['Ц'],
    'KeyE': bk0010_01['У'],
    'KeyR': bk0010_01['К'],
    'KeyT': bk0010_01['Е'],
    'KeyY': bk0010_01['Н'],
    'KeyU': bk0010_01['Г'],
    'KeyI': bk0010_01['Ш'],
    'KeyO': bk0010_01['Щ'],
    'KeyP': bk0010_01['З'],
    'BracketLeft': bk0010_01['Х'],
    'BracketRight': bk0010_01[':'],
    'Backquote': bk0010_01['Ъ'],
    'Home': bk0010_01['ВС'],

    'ControlLeft': bk0010_01['СУ'],
    'ControlRight': bk0010_01['СУ'],
    'KeyA': bk0010_01['Ф'],
    'KeyS': bk0010_01['Ы'],
    'KeyD': bk0010_01['В'],
    'KeyF': bk0010_01['А'],
    'KeyG': bk0010_01['П'],
    'KeyH': bk0010_01['Р'],
    'KeyJ': bk0010_01['О'],
    'KeyK': bk0010_01['Л'],
    'KeyL': bk0010_01['Д'],
    'Semicolon': bk0010_01['Ж'],
    'Quote': bk0010_01['Э'],
    'Backslash': bk0010_01['.'],
    'Enter': bk0010_01['ВВОД'],

    'KeyZ': bk0010_01['Я'],
    'KeyX': bk0010_01['Ч'],
    'KeyC': bk0010_01['С'],
    'KeyV': bk0010_01['М'],
    'KeyB': bk0010_01['И'],
    'KeyN': bk0010_01['Т'],
    'KeyM': bk0010_01['Ь'],
    'Comma': bk0010_01['Б'],
    'Period': bk0010_01['Ю'],
    'Slash': bk0010_01[','],

    'MetaLeft': bk0010_01['РУС'],
    'AltLeft': bk0010_01['АР2'],
    'AltRight': bk0010_01['АР2'],
    'Space': bk0010_01['ПРОБЕЛ'],
    'MetaRight': bk0010_01['ЛАТ'],

    'ArrowLeft': bk0010_01['ВЛЕВО'],
    'ArrowUp': bk0010_01['ВВЕРХ'],
    'ArrowDown': bk0010_01['ВНИЗ'],
    'ArrowRight': bk0010_01['ВПРАВО']
}

export const translation = {
    'А': {
        rus: true,
        key: {
            ...bk0010_01['А'],
            setCapital: true,
            rightRegister: false
        }
    },
    'Б': {
        rus: true,
        key: {
            ...bk0010_01['Б'],
            setCapital: true,
            rightRegister: false
        }
    },
    'В': {
        rus: true,
        key: {
            ...bk0010_01['В'],
            setCapital: true,
            rightRegister: false
        }
    },
    'Г': {
        rus: true,
        key: {
            ...bk0010_01['Г'],
            setCapital: true,
            rightRegister: false
        }
    },
    'Д': {
        rus: true,
        key: {
            ...bk0010_01['Д'],
            setCapital: true,
            rightRegister: false
        }
    },
    'Е': {
        rus: true,
        key: {
            ...bk0010_01['Е'],
            setCapital: true,
            rightRegister: false
        }
    },
    'Ж': {
        rus: true,
        key: {
            ...bk0010_01['Ж'],
            setCapital: true,
            rightRegister: false
        }
    },
    'З': {
        rus: true,
        key: {
            ...bk0010_01['З'],
            setCapital: true,
            rightRegister: false
        }
    },
    'И': {
        rus: true,
        key: {
            ...bk0010_01['И'],
            setCapital: true,
            rightRegister: false
        }
    },
    'Й': {
        rus: true,
        key: {
            ...bk0010_01['Й'],
            setCapital: true,
            rightRegister: false
        }
    },
    'К': {
        rus: true,
        key: {
            ...bk0010_01['К'],
            setCapital: true,
            rightRegister: false
        }
    },
    'Л': {
        rus: true,
        key: {
            ...bk0010_01['Л'],
            setCapital: true,
            rightRegister: false
        }
    },
    'М': {
        rus: true,
        key: {
            ...bk0010_01['М'],
            setCapital: true,
            rightRegister: false
        }
    },
    'Н': {
        rus: true,
        key: {
            ...bk0010_01['Н'],
            setCapital: true,
            rightRegister: false
        }
    },
    'О': {
        rus: true,
        key: {
            ...bk0010_01['О'],
            setCapital: true,
            rightRegister: false
        }
    },
    'П': {
        rus: true,
        key: {
            ...bk0010_01['П'],
            setCapital: true,
            rightRegister: false
        }
    },
    'Р': {
        rus: true,
        key: {
            ...bk0010_01['Р'],
            setCapital: true,
            rightRegister: false
        }
    },
    'С': {
        rus: true,
        key: {
            ...bk0010_01['С'],
            setCapital: true,
            rightRegister: false
        }
    },
    'Т': {
        rus: true,
        key: {
            ...bk0010_01['Т'],
            setCapital: true,
            rightRegister: false
        }
    },
    'У': {
        rus: true,
        key: {
            ...bk0010_01['У'],
            setCapital: true,
            rightRegister: false
        }
    },
    'Ф': {
        rus: true,
        key: {
            ...bk0010_01['Ф'],
            setCapital: true,
            rightRegister: false
        }
    },
    'Х': {
        rus: true,
        key: {
            ...bk0010_01['Х'],
            setCapital: true,
            rightRegister: false
        }
    },
    'Ц': {
        rus: true,
        key: {
            ...bk0010_01['Ц'],
            setCapital: true,
            rightRegister: false
        }
    },
    'Ч': {
        rus: true,
        key: {
            ...bk0010_01['Ч'],
            setCapital: true,
            rightRegister: false
        }
    },
    'Ш': {
        rus: true,
        key: {
            ...bk0010_01['Ш'],
            setCapital: true,
            rightRegister: false
        }
    },
    'Щ': {
        rus: true,
        key: {
            ...bk0010_01['Щ'],
            setCapital: true,
            rightRegister: false
        }
    },
    'Ъ': {
        rus: true,
        key: {
            ...bk0010_01['Ъ'],
            setCapital: true,
            rightRegister: false
        }
    },
    'Ы': {
        rus: true,
        key: {
            ...bk0010_01['Ы'],
            setCapital: true,
            rightRegister: false
        }
    },
    'Ь': {
        rus: true,
        key: {
            ...bk0010_01['Ь'],
            setCapital: true,
            rightRegister: false
        }
    },
    'Э': {
        rus: true,
        key: {
            ...bk0010_01['Э'],
            setCapital: true,
            rightRegister: false
        }
    },
    'Ю': {
        rus: true,
        key: {
            ...bk0010_01['Ю'],
            setCapital: true,
            rightRegister: false
        }
    },
    'Я': {
        rus: true,
        key: {
            ...bk0010_01['Я'],
            setCapital: true,
            rightRegister: false
        }
    },

    'а': {
        rus: true,
        key: {
            ...bk0010_01['А'],
            setCapital: false,
            rightRegister: false
        }
    },
    'б': {
        rus: true,
        key: {
            ...bk0010_01['Б'],
            setCapital: false,
            rightRegister: false
        }
    },
    'в': {
        rus: true,
        key: {
            ...bk0010_01['В'],
            setCapital: false,
            rightRegister: false
        }
    },
    'г': {
        rus: true,
        key: {
            ...bk0010_01['Г'],
            setCapital: false,
            rightRegister: false
        }
    },
    'д': {
        rus: true,
        key: {
            ...bk0010_01['Д'],
            setCapital: false,
            rightRegister: false
        }
    },
    'е': {
        rus: true,
        key: {
            ...bk0010_01['Е'],
            setCapital: false,
            rightRegister: false
        }
    },
    'ж': {
        rus: true,
        key: {
            ...bk0010_01['Ж'],
            setCapital: false,
            rightRegister: false
        }
    },
    'з': {
        rus: true,
        key: {
            ...bk0010_01['З'],
            setCapital: false,
            rightRegister: false
        }
    },
    'и': {
        rus: true,
        key: {
            ...bk0010_01['И'],
            setCapital: false,
            rightRegister: false
        }
    },
    'й': {
        rus: true,
        key: {
            ...bk0010_01['Й'],
            setCapital: false,
            rightRegister: false
        }
    },
    'к': {
        rus: true,
        key: {
            ...bk0010_01['К'],
            setCapital: false,
            rightRegister: false
        }
    },
    'л': {
        rus: true,
        key: {
            ...bk0010_01['Л'],
            setCapital: false,
            rightRegister: false
        }
    },
    'м': {
        rus: true,
        key: {
            ...bk0010_01['М'],
            setCapital: false,
            rightRegister: false
        }
    },
    'н': {
        rus: true,
        key: {
            ...bk0010_01['Н'],
            setCapital: false,
            rightRegister: false
        }
    },
    'о': {
        rus: true,
        key: {
            ...bk0010_01['О'],
            setCapital: false,
            rightRegister: false
        }
    },
    'п': {
        rus: true,
        key: {
            ...bk0010_01['П'],
            setCapital: false,
            rightRegister: false
        }
    },
    'р': {
        rus: true,
        key: {
            ...bk0010_01['Р'],
            setCapital: false,
            rightRegister: false
        }
    },
    'с': {
        rus: true,
        key: {
            ...bk0010_01['С'],
            setCapital: false,
            rightRegister: false
        }
    },
    'т': {
        rus: true,
        key: {
            ...bk0010_01['Т'],
            setCapital: false,
            rightRegister: false
        }
    },
    'у': {
        rus: true,
        key: {
            ...bk0010_01['У'],
            setCapital: false,
            rightRegister: false
        }
    },
    'ф': {
        rus: true,
        key: {
            ...bk0010_01['Ф'],
            setCapital: false,
            rightRegister: false
        }
    },
    'х': {
        rus: true,
        key: {
            ...bk0010_01['Х'],
            setCapital: false,
            rightRegister: false
        }
    },
    'ц': {
        rus: true,
        key: {
            ...bk0010_01['Ц'],
            setCapital: false,
            rightRegister: false
        }
    },
    'ч': {
        rus: true,
        key: {
            ...bk0010_01['Ч'],
            setCapital: false,
            rightRegister: false
        }
    },
    'ш': {
        rus: true,
        key: {
            ...bk0010_01['Ш'],
            setCapital: false,
            rightRegister: false
        }
    },
    'щ': {
        rus: true,
        key: {
            ...bk0010_01['Щ'],
            setCapital: false,
            rightRegister: false
        }
    },
    'ъ': {
        rus: true,
        key: {
            ...bk0010_01['Ъ'],
            setCapital: false,
            rightRegister: false
        }
    },
    'ы': {
        rus: true,
        key: {
            ...bk0010_01['Ы'],
            setCapital: false,
            rightRegister: false
        }
    },
    'ь': {
        rus: true,
        key: {
            ...bk0010_01['Ь'],
            setCapital: false,
            rightRegister: false
        }
    },
    'э': {
        rus: true,
        key: {
            ...bk0010_01['Э'],
            setCapital: false,
            rightRegister: false
        }
    },
    'ю': {
        rus: true,
        key: {
            ...bk0010_01['Ю'],
            setCapital: false,
            rightRegister: false
        }
    },
    'я': {
        rus: true,
        key: {
            ...bk0010_01['Я'],
            setCapital: false,
            rightRegister: false
        }
    },

    'A': {
        rus: false,
        key: {
            ...bk0010_01['А'],
            setCapital: true,
            rightRegister: false
        }
    },
    'B': {
        rus: false,
        key: {
            ...bk0010_01['Б'],
            setCapital: true,
            rightRegister: false
        }
    },
    'C': {
        rus: false,
        key: {
            ...bk0010_01['Ц'],
            setCapital: true,
            rightRegister: false
        }
    },
    'D': {
        rus: false,
        key: {
            ...bk0010_01['Д'],
            setCapital: true,
            rightRegister: false
        }
    },
    'E': {
        rus: false,
        key: {
            ...bk0010_01['Е'],
            setCapital: true,
            rightRegister: false
        }
    },
    'F': {
        rus: false,
        key: {
            ...bk0010_01['Ф'],
            setCapital: true,
            rightRegister: false
        }
    },
    'G': {
        rus: false,
        key: {
            ...bk0010_01['Г'],
            setCapital: true,
            rightRegister: false
        }
    },
    'H': {
        rus: false,
        key: {
            ...bk0010_01['Х'],
            setCapital: true,
            rightRegister: false
        }
    },
    'I': {
        rus: false,
        key: {
            ...bk0010_01['И'],
            setCapital: true,
            rightRegister: false
        }
    },
    'J': {
        rus: false,
        key: {
            ...bk0010_01['Й'],
            setCapital: true,
            rightRegister: false
        }
    },
    'K': {
        rus: false,
        key: {
            ...bk0010_01['К'],
            setCapital: true,
            rightRegister: false
        }
    },
    'L': {
        rus: false,
        key: {
            ...bk0010_01['Л'],
            setCapital: true,
            rightRegister: false
        }
    },
    'M': {
        rus: false,
        key: {
            ...bk0010_01['М'],
            setCapital: true,
            rightRegister: false
        }
    },
    'N': {
        rus: false,
        key: {
            ...bk0010_01['Н'],
            setCapital: true,
            rightRegister: false
        }
    },
    'O': {
        rus: false,
        key: {
            ...bk0010_01['О'],
            setCapital: true,
            rightRegister: false
        }
    },
    'P': {
        rus: false,
        key: {
            ...bk0010_01['П'],
            setCapital: true,
            rightRegister: false
        }
    },
    'Q': {
        rus: false,
        key: {
            ...bk0010_01['Я'],
            setCapital: true,
            rightRegister: false
        }
    },
    'R': {
        rus: false,
        key: {
            ...bk0010_01['Р'],
            setCapital: true,
            rightRegister: false
        }
    },
    'S': {
        rus: false,
        key: {
            ...bk0010_01['С'],
            setCapital: true,
            rightRegister: false
        }
    },
    'T': {
        rus: false,
        key: {
            ...bk0010_01['Т'],
            setCapital: true,
            rightRegister: false
        }
    },
    'U': {
        rus: false,
        key: {
            ...bk0010_01['У'],
            setCapital: true,
            rightRegister: false
        }
    },
    'V': {
        rus: false,
        key: {
            ...bk0010_01['Ж'],
            setCapital: true,
            rightRegister: false
        }
    },
    'W': {
        rus: false,
        key: {
            ...bk0010_01['В'],
            setCapital: true,
            rightRegister: false
        }
    },
    'X': {
        rus: false,
        key: {
            ...bk0010_01['Ь'],
            setCapital: true,
            rightRegister: false
        }
    },
    'Y': {
        rus: false,
        key: {
            ...bk0010_01['Ы'],
            setCapital: true,
            rightRegister: false
        }
    },
    'Z': {
        rus: false,
        key: {
            ...bk0010_01['З'],
            setCapital: true,
            rightRegister: false
        }
    },

    'a': {
        rus: false,
        key: {
            ...bk0010_01['А'],
            setCapital: false,
            rightRegister: false
        }
    },
    'b': {
        rus: false,
        key: {
            ...bk0010_01['Б'],
            setCapital: false,
            rightRegister: false
        }
    },
    'c': {
        rus: false,
        key: {
            ...bk0010_01['Ц'],
            setCapital: false,
            rightRegister: false
        }
    },
    'd': {
        rus: false,
        key: {
            ...bk0010_01['Д'],
            setCapital: false,
            rightRegister: false
        }
    },
    'e': {
        rus: false,
        key: {
            ...bk0010_01['Е'],
            setCapital: false,
            rightRegister: false
        }
    },
    'f': {
        rus: false,
        key: {
            ...bk0010_01['Ф'],
            setCapital: false,
            rightRegister: false
        }
    },
    'g': {
        rus: false,
        key: {
            ...bk0010_01['Г'],
            setCapital: false,
            rightRegister: false
        }
    },
    'h': {
        rus: false,
        key: {
            ...bk0010_01['Х'],
            setCapital: false,
            rightRegister: false
        }
    },
    'i': {
        rus: false,
        key: {
            ...bk0010_01['И'],
            setCapital: false,
            rightRegister: false
        }
    },
    'j': {
        rus: false,
        key: {
            ...bk0010_01['Й'],
            setCapital: false,
            rightRegister: false
        }
    },
    'k': {
        rus: false,
        key: {
            ...bk0010_01['К'],
            setCapital: false,
            rightRegister: false
        }
    },
    'l': {
        rus: false,
        key: {
            ...bk0010_01['Л'],
            setCapital: false,
            rightRegister: false
        }
    },
    'm': {
        rus: false,
        key: {
            ...bk0010_01['М'],
            setCapital: false,
            rightRegister: false
        }
    },
    'n': {
        rus: false,
        key: {
            ...bk0010_01['Н'],
            setCapital: false,
            rightRegister: false
        }
    },
    'o': {
        rus: false,
        key: {
            ...bk0010_01['О'],
            setCapital: false,
            rightRegister: false
        }
    },
    'p': {
        rus: false,
        key: {
            ...bk0010_01['П'],
            setCapital: false,
            rightRegister: false
        }
    },
    'q': {
        rus: false,
        key: {
            ...bk0010_01['Я'],
            setCapital: false,
            rightRegister: false
        }
    },
    'r': {
        rus: false,
        key: {
            ...bk0010_01['Р'],
            setCapital: false,
            rightRegister: false
        }
    },
    's': {
        rus: false,
        key: {
            ...bk0010_01['С'],
            setCapital: false,
            rightRegister: false
        }
    },
    't': {
        rus: false,
        key: {
            ...bk0010_01['Т'],
            setCapital: false,
            rightRegister: false
        }
    },
    'u': {
        rus: false,
        key: {
            ...bk0010_01['У'],
            setCapital: false,
            rightRegister: false
        }
    },
    'v': {
        rus: false,
        key: {
            ...bk0010_01['Ж'],
            setCapital: false,
            rightRegister: false
        }
    },
    'w': {
        rus: false,
        key: {
            ...bk0010_01['В'],
            setCapital: false,
            rightRegister: false
        }
    },
    'x': {
        rus: false,
        key: {
            ...bk0010_01['Ь'],
            setCapital: false,
            rightRegister: false
        }
    },
    'y': {
        rus: false,
        key: {
            ...bk0010_01['Ы'],
            setCapital: false,
            rightRegister: false
        }
    },
    'z': {
        rus: false,
        key: {
            ...bk0010_01['З'],
            setCapital: false,
            rightRegister: false
        }
    },

    ',': {
        key: {
            ...bk0010_01[','],
            rightRegister: false
        }
    },
    '<': {
        key: {
            ...bk0010_01[','],
            rightRegister: true
        }
    },

    '.': {
        key: {
            ...bk0010_01['.'],
            rightRegister: false
        }
    },
    '>': {
        key: {
            ...bk0010_01['.'],
            rightRegister: true
        }
    },

    '/': {
        key: {
            ...bk0010_01['/'],
            rightRegister: false
        }
    },
    '?': {
        key: {
            ...bk0010_01['/'],
            rightRegister: true
        }
    },

    ';': {
        key: {
            ...bk0010_01[';'],
            rightRegister: false
        }
    },
    ':': {
        key: {
            ...bk0010_01[':'],
            rightRegister: false
        }
    },

    '\'': {
        key: {
            ...bk0010_01['7'],
            rightRegister: true
        }
    },
    '&': {
        key: {
            ...bk0010_01['6'],
            rightRegister: true
        }
    },
    '*': {
        key: {
            ...bk0010_01[':'],
            rightRegister: true
        }
    },
    '(': {
        key: {
            ...bk0010_01['8'],
            rightRegister: true
        }
    },
    ')': {
        key: {
            ...bk0010_01['9'],
            rightRegister: true
        }
    },

    '~': {
        rus: false,
        key: {
            ...bk0010_01['Ч'],
            setCapital: true,
            rightRegister: true
        }
    },
    '^': {
        rus: false,
        key: {
            ...bk0010_01['Ч'],
            setCapital: false,
            rightRegister: false
        }
    },

    '@': {
        rus: false,
        key: {
            ...bk0010_01['Ю'],
            setCapital: true,
            rightRegister: false
        }
    },
    '`': {
        rus: false,
        key: {
            ...bk0010_01['Ю'],
            setCapital: false,
            rightRegister: false
        }
    },
    '"': {
        key: {
            ...bk0010_01['2'],
            rightRegister: true
        }
    },
    '№': {
        key: {
            ...bk0010_01['3'],
            rightRegister: true
        }
    },
    '%': {
        key: {
            ...bk0010_01['5'],
            rightRegister: true
        }
    },

    '=': {
        key: {
            ...bk0010_01['-'],
            rightRegister: true
        }
    },
    '+': {
        key: {
            ...bk0010_01[';'],
            rightRegister: true
        }
    },
    '\\': {
        rus: false,
        key: {
            ...bk0010_01['Э'],
            setCapital: true,
            rightRegister: false
        }
    },
    '|': {
        rus: false,
        key: {
            ...bk0010_01['Э'],
            setCapital: false,
            rightRegister: false
        }
    },

    '[': {
        rus: false,
        key: {
            ...bk0010_01['Ш'],
            setCapital: true,
            rightRegister: false
        }
    },
    ']': {
        rus: false,
        key: {
            ...bk0010_01['Щ'],
            setCapital: true,
            rightRegister: false
        }
    },

    '{': {
        rus: false,
        key: {
            ...bk0010_01['Ш'],
            setCapital: false,
            rightRegister: false
        }
    },
    '}': {
        rus: false,
        key: {
            ...bk0010_01['Щ'],
            setCapital: false,
            rightRegister: false
        }
    },
}
