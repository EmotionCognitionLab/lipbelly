export class CountdownTimer {
    #interval;
    #subscribers;

    constructor(secondsDuration) {
        this.duration = secondsDuration;
        this.remainingSeconds = secondsDuration;
        this.#interval = null;
        this.#subscribers = [];
    }

    start() {
        this.#interval = setInterval(this.#updateTimer.bind(this), 1000)
    }

    stop() {
        clearInterval(this.#interval)
    }

    reset() {
        this.stop()
        this.remainingSeconds = this.secondsDuration;
    }

    subscribe(callback) {
        this.#subscribers.push(callback);
    }

    #notifyTimerEnded() {
        this.#subscribers.forEach(cb => {
            cb();
        })
    }

    #updateTimer() {
        this.remainingSeconds -= 1
        if (this.remainingSeconds <= 0) {
            clearInterval(this.#interval)
            this.#notifyTimerEnded()
        }
    }
}