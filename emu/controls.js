export function numericControl(name, min, max, step, defaultValue) {
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
    slider.style = "width: 800px";
    
    const markInvalid = invalid => {
        if (invalid) {
            input.style.color = 'red'
        } else {
            input.style.color = ''
        }
    }

    const valueContainer = {
        value: defaultValue,
        markInvalid
    };

    input.onchange = () => {
        slider.value = input.value;
        valueContainer.value = Number(input.value);
    };

    slider.oninput = () => {
        input.value = slider.value;
        valueContainer.value = Number(slider.value);
    };

    div.appendChild(span);
    div.appendChild(input);
    div.appendChild(slider);
    document.body.appendChild(div);

    return valueContainer;
}

export function binaryControl(name, defaultValue, callback) {
    const div = document.createElement("div");

    const span = document.createElement("span");
    span.innerText = name;
    
    const valueContainer = {
        value: defaultValue
    };

    const input = document.createElement("input");
    input.checked = defaultValue;
    input.type = "checkbox";
    input.onchange = () => {
        valueContainer.value = input.checked;
        callback(valueContainer.value);
    };

    div.appendChild(span);
    div.appendChild(input);
    document.body.appendChild(div);

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
    document.body.appendChild(div);

    return valueContainer
}

export function button(name, callback) {
    const button = document.createElement("button")
    button.textContent = name
    button.onclick = callback
    document.body.appendChild(button)
}
