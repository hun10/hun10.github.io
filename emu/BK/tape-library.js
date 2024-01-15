import { binaryControl, selectControl } from '../controls.js'
import { bin2tape, raw2bin, named2bin } from './tape.js'

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
            } else if (recording.type === 'named-bin') {
                fetch(recording.url)
                    .then(response => response.arrayBuffer())
                    .then(array => callback({ pwm: bin2tape(
                        koi8(recording.name.padEnd(16)),
                        named2bin(new Uint8Array(array))
                    ) }))
                    .then(() => {
                        if (run) {
                            state.mode = 'play'
                            callback({ state })
                            refresh()
                        }
                    })
            } else if (recording.type === 'raw') {
                fetch(recording.url)
                    .then(response => response.arrayBuffer())
                    .then(array => callback({ pwm: bin2tape(
                        koi8(recording.name.padEnd(16)),
                        raw2bin(new Uint8Array(array))
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

    const container = document.createElement('div')
    container.style.display = 'inline-block'
    document.body.appendChild(container)

    container.appendChild(table)

    container.appendChild(rec)
    container.appendChild(ff)
    container.appendChild(play)
    container.appendChild(again)
    container.appendChild(stop)

    container.appendChild(motorStatus)

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
                url: 'maintape/DEMSL.GMS.bin'
            },
            {
                name: 'LEVEL1',
                type: 'bin',
                url: 'maintape/DEMSL1.bin'
            },
            {
                name: 'LEVEL2',
                type: 'bin',
                url: 'maintape/DEMSL2.bin'
            },
            {
                name: 'LEVEL3',
                type: 'bin',
                url: 'maintape/DEMSL3.bin'
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
                url: 'maintape/BIGCHESS.BIN'
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
                url: 'maintape/WAY.bin'
            },
            {
                name: 'БАТИСКАФ',
                type: 'bin',
                url: 'maintape/БАТИСКАФ.bin'
            },
            {
                name: 'БАТИСКАФ2',
                type: 'bin',
                url: 'maintape/batiskaf2.bin'
            },
            {
                name: 'SUPWAR',
                type: 'bin',
                url: 'maintape/SUPWAR.bin'
            },
            {
                name: 'BUBBLER',
                type: 'bin',
                url: 'maintape/BUBBLER.bin'
            },
            {
                name: '*CAVEMONTY*',
                type: 'bin',
                url: 'maintape/cavemonty.bin'
            },
            {
                name: 'PARRY FALL',
                type: 'bin',
                url: 'maintape/PARRYFALL.bin'
            },
            {
                name: 'DEKATL.GME',
                type: 'bin',
                url: 'maintape/DEKATL.GME.bin'
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
                name: 'CASINO.DOC',
                type: 'bin',
                url: 'maintape/CASINO.DOC.bin'
            },
            {
                name: 'CASINO',
                type: 'bin',
                url: 'maintape/CASINO.bin'
            },
            {
                name: 'CASINO.PIC',
                type: 'bin',
                url: 'maintape/CASINO.PIC.bin'
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
                url: 'maintape/ASSASSIN.bin'
            },
            {
                name: 'ASSASSIN2',
                type: 'bin',
                url: 'maintape/ASSASSIN.gms.bin'
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
                url: 'maintape/FLYBALL.bin'
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
                url: 'maintape/parowoz.bin'
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
                url: 'maintape/SHERIF.bin'
            }
        ],
        sideB: [
            {
                name: 'УНИВЕРМАГ',
                type: 'bin',
                url: 'maintape/uniwermag.bin'
            },
            {
                name: 'КОШКА',
                type: 'bin',
                url: 'maintape/CAT.bin'
            },
            {
                name: 'ТЕННИС',
                type: 'bin',
                url: 'maintape/tennis.bin'
            },
            {
                name: 'РАЛЛИ21',
                type: 'bin',
                url: 'maintape/ralli.bin'
            }
        ]
    },
    {
        title: 'CHEK: Комплект № 5',
        sideA: [
            {
                name: 'BLOCK OUT',
                type: 'bin',
                url: 'maintape/BLOCKOUT.bin'
            },
            {
                name: 'STONE NIGHTMARE',
                type: 'bin',
                url: 'maintape/STONENIGHTMARE.bin'
            },
            {
                name: 'BREAK HOUSE',
                type: 'bin',
                url: 'maintape/BREAKHOUSE.bin'
            }
        ],
        sideB: [
            {
                name: 'ARKANOID',
                type: 'bin',
                url: 'maintape/ARKANOID.bin'
            },
            {
                name: 'HELL',
                type: 'bin',
                url: 'maintape/HELL.bin'
            },
            {
                name: 'PARADIS',
                type: 'bin',
                url: 'maintape/HEAVEN.bin'
            },
            {
                name: 'BARMEN',
                type: 'bin',
                url: 'maintape/BARMAN.bin'
            },
            {
                name: 'FARAON',
                type: 'bin',
                url: 'maintape/FARAON.bin'
            }
        ]
    },
    {
        title: 'Modern Stuff',
        sideA: [
            {
                name: 'SCROLLER',
                type: 'bin',
                url: 'maintape/SCROLLER.bin'
            },
            {
                name: 'INF',
                type: 'pwm',
                url: 'maintape/inf.json'
            },
            {
                name: 'TEST ADD',
                type: 'bin',
                url: 'tools/test-add.bin'
            },
            {
                name: 'TEST CMP',
                type: 'bin',
                url: 'tools/test-cmp.bin'
            },
            {
                name: 'TEST MOV',
                type: 'bin',
                url: 'tools/test-mov.bin'
            },
            {
                name: 'CODE TEST',
                type: 'bin',
                url: 'tools/code-test.bin'
            },
            {
                name: '45COM LO',
                type: 'bin',
                url: 'tools/45com-lo.bin'
            },
            {
                name: 'MULTICOL',
                type: 'bin',
                url: 'maintape/MULTICOL.bin'
            },
            {
                name: 'MELMAN',
                type: 'bin',
                url: 'maintape/MELMAN.bin'
            },
            {
                name: 'ГОВОРУН',
                type: 'bin',
                url: 'maintape/goworun.bin'
            },
            {
                name: 'ШЕФ',
                type: 'bin',
                url: 'maintape/CHIEF.bin'
            },
            {
                name: 'CHIEF.OVL',
                type: 'bin',
                url: 'maintape/CHIEF.OVL.bin'
            },
            {
                name: 'АФРИКА',
                type: 'bin',
                url: 'maintape/Africa.bin'
            }
        ],
        sideB: [
            {
                name: 'MADDOC.BIN',
                type: 'bin',
                url: 'maintape/MadDoc.bin'
            },
            {
                name: 'MADGHOST_SCR',
                type: 'bin',
                url: 'maintape/MadGhost_Scr.bin'
            },
            {
                name: 'BARBAR',
                type: 'bin',
                url: 'maintape/BARBAR.bin'
            },
            {
                name: 'BARB.OV1',
                type: 'bin',
                url: 'maintape/BARB.OV1.bin'
            },
            {
                name: 'BARB.OV2',
                type: 'bin',
                url: 'maintape/BARB.OV2.bin'
            },
            {
                name: 'BARB.OV3',
                type: 'bin',
                url: 'maintape/BARB.OV3.bin'
            },
            {
                name: 'LOG CABIN DIZZY',
                type: 'bin',
                url: 'maintape/dizzy2021.bin'
            },
            {
                name: '3CH PLAY',
                type: 'bin',
                url: 'tools/3CHplay.bin'
            },
            {
                name: 'DIZZY.3CH',
                type: 'raw',
                url: 'tools/DIZZY.3CH.raw.bin'
            },
            {
                name: 'TRON.3CH',
                type: 'raw',
                url: 'tools/TRON.3CH.raw.bin'
            },
            {
                name: 'CPUTEST',
                type: 'bin',
                url: 'maintape/CPUTEST.bin'
            }
        ]
    },
    {
        title: 'Новый сборник',
        sideA: [
            {
                name: 'FIST',
                type: 'audio',
                url: 'realtape/FIST.wav'
            },
            {
                name: 'FIST.OVL',
                type: 'audio',
                url: 'realtape/FIST.OVL.wav'
            },
            {
                name: 'KLADJ',
                type: 'audio',
                url: 'realtape/KLADJ.wav'
            },
            {
                name: 'LIFE.EXE',
                type: 'audio',
                url: 'realtape/LIFE.EXE.wav'
            },
            {
                name: 'COMIC',
                type: 'bin',
                url: 'maintape/COMIC.bin'
            },
            {
                name: 'ETAP01.DAT',
                type: 'bin',
                url: 'maintape/ETAP01.DAT.bin'
            },
            {
                name: 'ETAP2A.DAT',
                type: 'bin',
                url: 'maintape/ETAP2A.DAT.bin'
            },
            {
                name: 'ETAP2B.DAT',
                type: 'bin',
                url: 'maintape/ETAP2B.DAT.bin'
            },
            {
                name: 'FLIER',
                type: 'bin',
                url: 'maintape/FLIER.bin'
            },
            {
                name: 'ASTRDROM',
                type: 'bin',
                url: 'maintape/ASTRDROM.bin'
            },
            {
                name: 'ASTRDROM.OVL',
                type: 'bin',
                url: 'maintape/ASTRDROM.OVL.bin'
            },
            {
                name: 'BABY',
                type: 'bin',
                url: 'maintape/BABY.bin'
            },
            {
                name: 'NEW YEAR',
                type: 'bin',
                url: 'maintape/NEW YEAR.bin'
            }
        ],
        sideB: [
            {
                name: 'TOORUN',
                type: 'bin',
                url: 'maintape/TOORUN.bin'
            },
            {
                name: 'EXOLON',
                type: 'bin',
                url: 'maintape/Exolon.bin'
            },
            {
                name: 'exolon.ovl',
                type: 'bin',
                url: 'maintape/Exolon.ovl.bin'
            },
            {
                name: 'ДЕСАНТНИК.ДОК',
                type: 'bin',
                url: 'maintape/DESANTNIK.DOC.bin'
            },
            {
                name: 'ДЕСАНТНИК1',
                type: 'bin',
                url: 'maintape/DESANTNIK1.bin'
            },
            {
                name: 'ДЕСАНТНИК2',
                type: 'bin',
                url: 'maintape/DESANTNIK2.bin'
            },
            {
                name: 'ДЕСАНТНИК3',
                type: 'bin',
                url: 'maintape/DESANTNIK3.bin'
            },
            {
                name: 'ДЕСАНТНИК4',
                type: 'bin',
                url: 'maintape/DESANTNIK4.bin'
            },
            {
                name: 'ДЕСАНТНИК5',
                type: 'bin',
                url: 'maintape/DESANTNIK5.bin'
            },
            {
                name: 'LODE RUNNER',
                type: 'bin',
                url: 'maintape/LODERUNNER.bin'
            },
            {
                name: 'LR.OVL',
                type: 'bin',
                url: 'maintape/LR.OVL.bin'
            }
        ]
    }, {
        title: 'Добытое',
        sideA: [
            {
                name: 'BILREK',
                type: 'named-bin',
                url: 'maintape/BILREK.bin'
            },
            {
                name: 'BYCOP2',
                type: 'named-bin',
                url: 'maintape/BYCOP2.bin'
            },
            {
                name: 'CHEC',
                type: 'named-bin',
                url: 'maintape/CHEC.bin'
            },
            {
                name: 'CHECK',
                type: 'named-bin',
                url: 'maintape/CHECK.bin'
            },
            {
                name: 'COLDOC',
                type: 'named-bin',
                url: 'maintape/COLDOC.bin'
            },
            {
                name: 'PODDAW',
                type: 'named-bin',
                url: 'maintape/PODDAW.bin'
            },
            {
                name: 'UNIC4',
                type: 'named-bin',
                url: 'maintape/UNIC4.bin'
            },
            {
                name: 'UNIDOC',
                type: 'named-bin',
                url: 'maintape/UNIDOC.bin'
            },
            {
                name: 'БАТИСКАФ',
                type: 'bin',
                url: 'maintape/БАТИСКАФ.bin'
            }
        ],
        sideB: []
    }, {
        title: 'Разное',
        sideA: [
            {
                name: 'ZOOM',
                type: 'bin',
                url: 'maintape/ZOOM.bin'
            },
            {
                name: 'WAR12',
                type: 'bin',
                url: 'maintape/WAR12.bin'
            },
            {
                name: 'ВАМПИР',
                type: 'bin',
                url: 'maintape/WAMPIRF.bin'
            },
            {
                name: 'УДАВ',
                type: 'bin',
                url: 'maintape/udaw.bin'
            },
            {
                name: 'TRAVEL',
                type: 'bin',
                url: 'maintape/TRAVEL.bin'
            },
            {
                name: 'ТЕТРИС',
                type: 'bin',
                url: 'maintape/tetris.bin'
            },
            {
                name: 'SPACE WAR',
                type: 'bin',
                url: 'maintape/SPACEWAR.bin'
            },
            {
                name: 'SPACE HIT',
                type: 'bin',
                url: 'maintape/SPACEHIT.bin'
            },
            {
                name: 'SKIN DIVING',
                type: 'bin',
                url: 'maintape/SKINDIVING.bin'
            },
            {
                name: 'ROKI',
                type: 'bin',
                url: 'maintape/ROKI.bin'
            },
            {
                name: 'ПОЛИГОН',
                type: 'bin',
                url: 'maintape/poligon.bin'
            },
            {
                name: 'POLYGON 2',
                type: 'bin',
                url: 'maintape/POLYGON2.bin'
            },
            {
                name: 'ПИФ-ПАФ',
                type: 'bin',
                url: 'maintape/pifpaf.bin'
            },
            {
                name: 'PENTIS NEW',
                type: 'bin',
                url: 'maintape/pentisnew.bin'
            },
            {
                name: 'КОСИЛКА',
                type: 'bin',
                url: 'maintape/kosilka.bin'
            },
            {
                name: 'JETMAN',
                type: 'bin',
                url: 'maintape/JETMAN.bin'
            },
            {
                name: 'DIAMOND',
                type: 'bin',
                url: 'maintape/DIAMOND.bin'
            },
            {
                name: 'DIAMOND2',
                type: 'bin',
                url: 'maintape/DIAMOND2.bin'
            },
            {
                name: 'COLUMNS',
                type: 'bin',
                url: 'maintape/COLUMNS.bin'
            },
            {
                name: 'CIRCLER',
                type: 'bin',
                url: 'maintape/CIRCLER.bin'
            },
            {
                name: 'BREAKING BALL',
                type: 'bin',
                url: 'maintape/BREAKINGBALL.bin'
            }
        ],
        sideB: [
            {
                name: 'ДВА НЕГРА',
                type: 'audio',
                url: 'realtape/Dva-Negra.wav'
            },
            {
                name: 'ЗАМОК',
                type: 'bin',
                url: 'maintape/zamok.bin'
            },
            {
                name: 'ПОЛЕ ЧУДЕС',
                type: 'bin',
                url: 'maintape/POLECHUDES.bin'
            },
            {
                name: 'СЛОВАРЬ1',
                type: 'bin',
                url: 'maintape/slowarx1.bin'
            },
            {
                name: 'СЛОВАРЬ2',
                type: 'bin',
                url: 'maintape/slowarx2.bin'
            },
            {
                name: 'TARZAN',
                type: 'bin',
                url: 'maintape/TARZAN.bin'
            },
            {
                name: 'SUPER RALLY',
                type: 'bin',
                url: 'maintape/SUPERRALLY.bin'
            },
            {
                name: 'STAR',
                type: 'bin',
                url: 'maintape/STAR.bin'
            },
            {
                name: 'ШПИОН',
                type: 'bin',
                url: 'maintape/SPY.bin'
            },
            {
                name: 'PANGO',
                type: 'bin',
                url: 'maintape/PANGO.bin'
            },
            {
                name: 'НЕЧИСТЬ',
                type: 'bin',
                url: 'maintape/NECHIST.bin'
            },
            {
                name: 'ЛЕОПОЛЬД',
                type: 'bin',
                url: 'maintape/leopold.bin'
            },
            {
                name: 'GOAT',
                type: 'bin',
                url: 'maintape/GOAT.bin'
            },
            {
                name: 'GOAT#',
                type: 'bin',
                url: 'maintape/GOAT.GME.bin'
            },
            {
                name: 'FORT',
                type: 'bin',
                url: 'maintape/fort.bin'
            },
            {
                name: 'DROP ZONA',
                type: 'bin',
                url: 'maintape/DROPZONA.bin'
            },
            {
                name: 'ДОРОГА',
                type: 'bin',
                url: 'maintape/doroga.bin'
            },
            {
                name: 'DIZZY1',
                type: 'bin',
                url: 'maintape/DIZZY1.bin'
            },
            {
                name: 'DIZZY.GME',
                type: 'bin',
                url: 'maintape/DIZZY.GME.bin'
            },
            {
                name: 'COURIER',
                type: 'bin',
                url: 'maintape/COURIER.bin'
            },
            {
                name: 'BALLY',
                type: 'bin',
                url: 'maintape/BALLY.bin'
            }
        ]
    }
]
