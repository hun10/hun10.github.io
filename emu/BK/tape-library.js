import { binaryControl, selectControl } from '../controls.js'
import { bin2tape } from './tape.js'

function createSidesTable() {
    const table = document.createElement('table')

    const thead = document.createElement('thead')
    table.appendChild(thead)

    const thA = document.createElement('th')
    thA.innerText = 'Side A'
    thead.appendChild(thA)

    const thB = document.createElement('th')
    thB.innerText = 'Side B'
    thead.appendChild(thB)

    const tbody = document.createElement('tbody')
    table.appendChild(tbody)

    return {
        table,
        tbody
    }
}

const selectTape = (tbody, { sideA, sideB, writable }, callback) => {
    tbody.innerHTML = ''

    let pointer = 0
    while (pointer < sideA.length || pointer < sideB.length) {
        const tr = document.createElement('tr')
        tbody.appendChild(tr)

        const tdA = document.createElement('td')
        tr.appendChild(tdA)

        const tdB = document.createElement('td')
        tr.appendChild(tdB)

        const pointerToPass = pointer
        if (pointer < sideA.length) {
            tdA.appendChild(anchor(sideA[pointer], () => {
                callback({
                    side: 'sideA',
                    pointer: pointerToPass
                })
            }))
        }

        if (writable) {
            const a = document.createElement('a')
            a.innerText = 'Export'
            a.href = `data:application/application/json;base64,${btoa(JSON.stringify(sideA[pointer].pwm))}`
            a.download = `${sideA[pointer].name}.json`
            tdB.appendChild(a)
        } else {
            if (pointer < sideB.length) {
                tdB.appendChild(anchor(sideB[pointer], () => {
                    callback({
                        side: 'sideB',
                        pointer: pointerToPass
                    })
                }))
            }
        }

        pointer++
    }
}

function koi8(text) {
    return [...text].map(c => {
        const code = c.charCodeAt(0)
        const koi8index = 'юабцдефгхийклмнопярстужвьызшэщчъЮАБЦДЕФГХИЙКЛМНОПЯРСТУЖВЬЫЗШЭЩЧЪ'.indexOf(c)

        if (koi8index > -1) {
            return 192 + koi8index
        }

        return code
    })
}

function anchor(recording, callback) {
    if (recording.type !== undefined) {
        const a = document.createElement('a')
        a.innerText = recording.name
        a.href = '#'
        a.onclick = e => {
            e.preventDefault()
            callback()
        }
        return a
    } else {
        const span = document.createElement('span')
        span.innerText = recording.name
        return span
    }
}

export function createTapeControls(callback) {
    const state = {
        motorRunning: false,
        ignoringRemote: false,
        fastForward: false,
        mode: 'stop',
        currentTape: tapes[0],
        currentSide: 'sideA',
        currentFile: 0
    }

    let refresh

    const { table, tbody } = createSidesTable()
    const play = button('Play', () => {
        state.mode = 'play'
        refresh()
    })
    const again = button('Again', () => {
        sendCurRec(true)
    })
    const ff = button('FF', () => {
        state.fastForward = true
        refresh()
    })
    const rec = button('Rec', () => {
        state.mode = 'record'
        refresh()
    })
    const stop = button('Stop', () => {
        state.mode = 'stop'
        refresh()
    })
    const motorStatus = document.createElement('span')

    refresh = () => {
        if (state.mode === 'play') {
            play.disabled = true
            rec.disabled = false
        }
        if (state.mode === 'record') {
            play.disabled = false
            rec.disabled = true
        }
        if (state.mode === 'stop') {
            play.disabled = false
            rec.disabled = false
        }
        ff.disabled = state.fastForward
        motorStatus.innerText = state.motorRunning ? 'Motor is running' : 'Motor stopped'
        callback({
            state
        })
    }

    function sendCurRec(run) {
        if (state.currentFile < state.currentTape[state.currentSide].length) {
            const recording = state.currentTape[state.currentSide][state.currentFile]

            if (recording.type === 'bin') {
                fetch(recording.url)
                    .then(response => response.arrayBuffer())
                    .then(array => callback({ pwm: bin2tape(
                        koi8(recording.name.padEnd(16)),
                        new Uint8Array(array)
                    ) }))
                    .then(() => {
                        if (run) {
                            state.mode = 'play'
                            callback({ state })
                            refresh()
                        }
                    })
            } else if (recording.type === 'pwm') {
                if (recording.pwm) {
                    callback({ pwm: recording.pwm })
                    if (run) {
                        state.mode = 'play'
                        callback({ state })
                        refresh()
                    }
                } else if (recording.url) {
                    fetch(recording.url)
                        .then(response => response.json())
                        .then(pwm => callback({ pwm }))
                        .then(() => {
                            if (run) {
                                state.mode = 'play'
                                callback({ state })
                                refresh()
                            }
                        })
                }
            } else if (recording.type === 'audio') {
                fetch(recording.url)
                    .then(response => response.arrayBuffer())
                    .then(audio => callback({ audio }))
                    .then(() => {
                        if (run) {
                            state.mode = 'play'
                            callback({ state })
                            refresh()
                        }
                    })
            }
        }
    }

    function selectTapeLocal(sTape) {
        selectTape(tbody, sTape, ({ side, pointer }) => {
            state.currentSide = side
            state.currentFile = pointer
            sendCurRec(true)
            refresh()
        })
    }

    selectControl('Tape', tapes.map(t => t.title), tapeTitle => {
        state.currentTape = tapes.filter(t => t.title === tapeTitle)[0]
        rec.hidden = !state.currentTape.writable
        state.currentSide = 'sideA'
        state.currentFile = 0
        state.mode = 'stop'
        state.motorRunning = false
        state.fastForward = false
        refresh()
        selectTapeLocal(state.currentTape)
    }, tapes[0].title)
    document.body.appendChild(table)

    document.body.appendChild(rec)
    document.body.appendChild(ff)
    document.body.appendChild(play)
    document.body.appendChild(again)
    document.body.appendChild(stop)

    document.body.appendChild(motorStatus)

    binaryControl('Ignore remote control', false, ignore => {
        state.ignoringRemote = ignore
        callback({
            state
        })
    })

    refresh()

    return {
        appendRecording: pwm => {
            tapes[0].sideA.push({
                name: new Date().toISOString(),
                type: 'pwm',
                pwm
            })
            selectTapeLocal(tapes[0])
        },
        update: ({
            motor,
            ff,
            ended
        }) => {
            if (motor !== undefined) {
                state.motorRunning = motor
            }
            if (ff !== undefined) {
                state.fastForward = ff
                if (!ff) {
                    state.mode = 'stop'
                }
            }
            if (ended) {
                state.fastForward = false

                state.currentFile++
                if (state.currentFile >= state.currentTape[state.currentSide].length) {
                    state.currentFile = 0
                    state.currentSide = state.currentSide === 'sideA' && state.currentTape.sideB.length > 0 ? 'sideB' : 'sideA'
                    state.mode = 'stop'
                    state.fastForward = false
                    state.motorRunning = false
                }
                sendCurRec()
            }
            refresh()
        }
    }
}

function button(title, callback) {
    const button = document.createElement('button')
    button.onclick = callback
    button.textContent = title
    return button
}

const tapes = [
    {
        title: 'Writable Tape',
        writable: true,
        sideA: [],
        sideB: []
    },
    {
        title: 'CHEK: Комплект № 12',
        sideA: [
            {
                name: 'HCOPY5',
                type: 'bin',
                url: 'maintape/HCOPY5.bin'
            },
            {
                name: 'HCOPY5.DOC'
            },
            {
                name: 'TRAMP',
                type: 'bin',
                url: 'maintape/tramp.bin'
            },
            {
                name: 'STALKER',
                type: 'bin',
                url: 'maintape/stalker.bin'
            },
            {
                name: 'BIOWAR',
                type: 'bin',
                url: 'maintape/biowar.bin'
            },
            {
                name: 'NEW PENTIS',
                type: 'bin',
                url: 'maintape/pentisnew.bin'
            },
            {
                name: 'SOLDAT2',
                type: 'bin',
                url: 'maintape/soldat.bin'
            },
            {
                name: 'POPCORN',
                type: 'bin',
                url: 'maintape/popcorn.bin'
            },
            {
                name: 'DEMON STALKER',
                type: 'bin',
                url: 'maintape/DemSl.bin'
            },
            {
                name: 'DEMON STALKER II',
                type: 'bin',
                url: 'maintape/DemSl.gms'
            },
            {
                name: 'LEVEL1',
                type: 'bin',
                url: 'maintape/DemSl1'
            },
            {
                name: 'LEVEL2',
                type: 'bin',
                url: 'maintape/DemSl2'
            },
            {
                name: 'LEVEL3',
                type: 'bin',
                url: 'maintape/DemSl3'
            },
            {
                name: 'CAVEMAN',
                type: 'bin',
                url: 'maintape/caveman.bin'
            },
            {
                name: 'KING2',
                type: 'bin',
                url: 'maintape/king2.bin'
            },
            {
                name: 'CAVE',
                type: 'bin',
                url: 'maintape/cave.bin'
            },
            {
                name: 'BIGCHESS2',
                type: 'bin',
                url: 'maintape/BIGCHESS.bin'
            },
            {
                name: 'BIGCHESS2DOC',
                type: 'bin',
                url: 'maintape/BIGCHES5.DOC.bin'
            }
        ],
        sideB: [
            {
                name: 'DIMREK.1',
                type: 'pwm',
                url: 'maintape/dimrekl1.json'
            },
            {
                name: 'PUNK',
                type: 'bin',
                url: 'maintape/PUNK.bin'
            },
            {
                name: 'WAY',
                type: 'bin',
                url: 'maintape/WAY'
            },
            {
                name: 'БАТИСКАФ',
                type: 'bin',
                url: 'maintape/batiskaf'
            },
            {
                name: 'БАТ2.ГМЕ',
                type: 'bin',
                url: 'maintape/batiskaf2'
            },
            {
                name: 'SUPWAR',
                type: 'bin',
                url: 'maintape/SUPWAR'
            },
            {
                name: 'BUBBLER',
                type: 'bin',
                url: 'maintape/BUBBLER'
            },
            {
                name: '*CAVEMONTY*',
                type: 'bin',
                url: 'maintape/cavemonty.bin'
            },
            {
                name: 'PARRY FALL',
                type: 'bin',
                url: 'maintape/PARRY FALL'
            },
            {
                name: 'DEKATL.GME',
                type: 'bin',
                url: 'maintape/DEKATL.GME'
            },
            {
                name: 'WIST.GME',
                type: 'bin',
                url: 'maintape/WIST.bin'
            },
            {
                name: 'ДЖУНГЛИ.ДОК'
            },
            {
                name: 'ДЖУНГЛИ',
                type: 'bin',
                url: 'maintape/jungle.bin'
            },
            {
                name: 'ТАНКЕР.ДОК'
            },
            {
                name: 'ТАНКЕР',
                type: 'bin',
                url: 'maintape/tanker.bin'
            },
            {
                name: 'CAZINO.COD'
            },
            {
                name: 'SPCAZ.BIN'
            }
        ]
    },
    {
        title: 'CHEK: Сборный комплект (без номера)',
        sideA: [
            {
                name: 'BYCOP2'
            },
            {
                name: 'CHECKERS.DOC'
            },
            {
                name: 'CHECKERS'
            },
            {
                name: 'ПОДДАВКИ'
            },
            {
                name: 'COLUMN.DOC'
            },
            {
                name: 'COLUMN.GME'
            },
            {
                name: 'ASS1.ZAG',
                type: 'bin',
                url: 'maintape/ASSASSIN'
            },
            {
                name: 'ASSASSIN2',
                type: 'bin',
                url: 'maintape/ASS2'
            },
            {
                name: 'SOLDIER',
                type: 'audio',
                url: 'realtape/Soldier-1.wav'
            },
            {
                name: 'SOLDIER2'
            },
            {
                name: 'SOLDIER3'
            },
            {
                name: 'FLYBALL',
                type: 'bin',
                url: 'maintape/FLYBALL'
            },
            {
                name: 'WINDOW.DOC',
                type: 'bin',
                url: 'maintape/WINDOW.DOC.bin'
            },
            {
                name: 'WINDOW',
                type: 'bin',
                url: 'maintape/WINDOW.bin'
            },
            {
                name: 'UNIC4.DOC'
            },
            {
                name: 'UNIC4'
            },
            {
                name: 'DIK3.DOC',
                type: 'bin',
                url: 'maintape/DIK3.DOC.bin'
            },
            {
                name: 'DIK3',
                type: 'bin',
                url: 'maintape/DIK3.bin'
            },
            {
                name: 'OTTO.DOC',
                type: 'bin',
                url: 'maintape/OTTO.DOC.bin'
            },
            {
                name: 'OTTO',
                type: 'bin',
                url: 'maintape/OTTO.bin'
            },
            {
                name: 'FUTURE REKL1',
                type: 'bin',
                url: 'maintape/FUTURE.REKL1.bin'
            },
            {
                name: 'EPIC DOC',
                type: 'bin',
                url: 'maintape/EPIC_DOC.bin'
            },
            {
                name: 'EPIC SCR',
                type: 'bin',
                url: 'maintape/EPIC_SCR.bin'
            },
            {
                name: 'ПАРОВОЗ',
                type: 'bin',
                url: 'maintape/parowoz'
            }
        ],
        sideB: [
            {
                name: 'ФЕРРАРИ',
                type: 'audio',
                url: 'realtape/Ferrari.wav'
            }
        ]
    },
    {
        title: 'CHEK: Комплект № 4',
        sideA: [
            {
                name: 'ШЕРИФ',
                type: 'bin',
                url: 'maintape/SHERIF'
            }
        ],
        sideB: [
            {
                name: 'УНИВЕРМАГ',
                type: 'bin',
                url: 'maintape/uniwermag'
            },
            {
                name: 'КОШКА',
                type: 'bin',
                url: 'maintape/CAT'
            },
            {
                name: 'ТЕННИС',
                type: 'bin',
                url: 'maintape/tennis'
            },
            {
                name: 'РАЛЛИ21',
                type: 'bin',
                url: 'maintape/ralli'
            }
        ]
    },
    {
        title: 'CHEK: Комплект № 5',
        sideA: [
            {
                name: 'BLOCK OUT',
                type: 'bin',
                url: 'maintape/BLOCK OUT'
            },
            {
                name: 'STONE NIGHTMARE',
                type: 'bin',
                url: 'maintape/STONE NIGHTMARE'
            },
            {
                name: 'BREAK HOUSE 1',
                type: 'bin',
                url: 'maintape/BREAK HOUSE'
            }
        ],
        sideB: [
            {
                name: 'ARKANOID',
                type: 'bin',
                url: 'maintape/ARKANOID'
            },
            {
                name: 'HELL',
                type: 'bin',
                url: 'maintape/HELL'
            },
            {
                name: 'PARADIS',
                type: 'bin',
                url: 'maintape/HEAVEN'
            },
            {
                name: 'BARMEN',
                type: 'bin',
                url: 'maintape/BARMAN'
            },
            {
                name: 'FARAON',
                type: 'bin',
                url: 'maintape/FARAON'
            }
        ]
    },
    {
        title: 'Modern Stuff',
        sideA: [
            {
                name: 'SCROLLER',
                type: 'bin',
                url: 'maintape/SCROLLER'
            }
        ],
        sideB: []
    }
]