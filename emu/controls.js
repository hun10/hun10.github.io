const overlay = document.createElement('div')
overlay.hidden = true
overlay.style.position = 'fixed'
overlay.style.width = '100vw'
overlay.style.height = '100vh'
document.body.appendChild(overlay)

const root = document.createElement('div')
root.style.position = 'fixed'
root.style.backgroundColor = 'antiquewhite'
root.style.opacity = '70%'
root.style.padding = '10px'
root.style.top = '5vh'
root.style.bottom = '5vh'
root.style.width = '450px'
root.style.right = '10px'
root.style.overflow = 'scroll'
overlay.appendChild(root)

export function numericControl(name, min, max, step, defaultValue, callback = () => {}) {
    const div = document.createElement("div");

    const span = document.createElement("span");
    span.innerText = name;

    const input = document.createElement("input");
    input.value = defaultValue;

    const slider = document.createElement("input");
    slider.type = "range";
    slider.min = min;
    slider.max = max;
    slider.step = step;
    slider.value = defaultValue;
    slider.style = "width: 100%";
    
    const markInvalid = invalid => {
        if (invalid) {
            input.style.color = 'red'
        } else {
            input.style.color = ''
        }
    }

    const valueContainer = {
        value: defaultValue,
        markInvalid,
        getMax: () => {
            return +slider.max
        },
        setMax: value => {
            slider.max = value
            callback()
        },
        setValue: value => {
            if (valueContainer.value !== value) {
                valueContainer.value = value
                input.value = value
                slider.value = value
                callback()
            }
        }
    };

    input.onchange = () => {
        slider.value = input.value;
        valueContainer.setValue(Number(input.value))
    };

    slider.oninput = () => {
        input.value = slider.value;
        valueContainer.setValue(Number(slider.value));
    };

    div.appendChild(span);
    div.appendChild(input);
    div.appendChild(slider);
    root.appendChild(div);

    return valueContainer;
}

export function binaryControl(name, defaultValue, callback) {
    const div = document.createElement("div");

    const span = document.createElement("span");
    span.innerText = name;
    
    const input = document.createElement("input");
    input.checked = defaultValue;
    input.type = "checkbox";

    const valueContainer = {
        value: defaultValue,
        toggle: () => {
            input.click()
        }
    };

    input.onchange = () => {
        valueContainer.value = input.checked;
        if (callback !== undefined) {
            callback(valueContainer.value);
        }
    };

    div.appendChild(span);
    div.appendChild(input);
    root.appendChild(div);

    return valueContainer;
}

export function selectControl(name, options, callback, defaultValue) {
    const div = document.createElement("div");

    const span = document.createElement("span");
    span.innerText = name;

    const select = document.createElement("select");

    for (const option of options) {
        const el = document.createElement("option");
        el.innerText = option

        select.appendChild(el);
    }

    const valueContainer = {
        value: defaultValue
    };

    select.oninput = e => {
        valueContainer.value = e.target.value
        callback(e.target.value)
    }

    div.appendChild(span);
    div.appendChild(select);
    root.appendChild(div);

    return valueContainer
}

export function button(name, callback) {
    const button = document.createElement("button")
    button.textContent = name
    button.onclick = callback
    root.appendChild(button)
}


export function file(name, callback) {
    const div = document.createElement("div");

    const span = document.createElement("span");
    span.innerText = name;

    const input = document.createElement("input");
    input.type = "file";

    input.onchange = e => {
        callback(e.target.files[0])
    };

    div.appendChild(span);
    div.appendChild(input);
    root.appendChild(div);
}

export function number(name, defaultValue) {
    const div = document.createElement("span");

    const span = document.createElement("span");
    span.innerText = name;

    const input = document.createElement("input");
    input.type = "number";
    input.value = defaultValue

    const valueContainer = {
        value: defaultValue
    }

    input.onchange = () => {
        valueContainer.value = input.valueAsNumber
    };

    div.appendChild(span);
    div.appendChild(input);
    root.appendChild(div);

    return valueContainer
}

function toggle() {
    overlay.hidden = !overlay.hidden

    if (overlay.hidden) {
        document.activeElement?.blur()
    }
}

overlay.addEventListener('click', e => {
    if (e.target === overlay) {
        toggle()
    }
})

document.addEventListener('dblclick', e => {
    if (e.target.tagName === 'CANVAS') {
        toggle()
    }
})

document.addEventListener('keydown', e => {
	if (e.code === 'Escape' && !e.repeat) {
        toggle()

        e.preventDefault()
		e.stopPropagation()
    }
})