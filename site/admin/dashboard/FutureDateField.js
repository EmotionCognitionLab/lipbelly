import dayjs from 'dayjs';
import utc from 'dayjs/plugin/utc.js';
import timezone from 'dayjs/plugin/timezone.js';
dayjs.extend(utc);
dayjs.extend(timezone);

export class FutureDateField {
    constructor(key, datetime = null) {
        this.key = key;
        this.datetime = dayjs(datetime).format("YYYY-MM-DDTHH:mm");
        this.maxDate = dayjs().add(1, "month").format("YYYY-MM-DDT18:00");
        this.minDate = dayjs().add(1, "day").format("YYYY-MM-DDT18:00");
    }

    // NB: Users of the class need to wire this up.
    // In order to prevent the creation of a change
    // handler for every single field it is not
    // automatically connected to the change handler
    // of the text field.
    static handleChange(event) {
        const textField = event.target;
        const date = dayjs(textField.value).tz('America/Los_Angeles');
        const key = textField.dataset.key;
        return {key: key, datetime: date};
    }

}