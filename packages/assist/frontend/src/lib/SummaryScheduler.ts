import { logger } from '@thunderbirdops/services-utils';
import { AssistStorage } from '@/lib/AssistStorage';

const TIMESTAMP_KEY = 'assist-scheduler-timestamp';
const ALARM_HOUR_KEY = 'assist-alarm-hour';

const DEFAULT_ALARM_HOUR = 7;

export class SummaryScheduler {
  private lastRun: Date | null;
  private storage: AssistStorage;
  alarmHour: number;

  constructor(storage: AssistStorage) {
    this.lastRun = null;
    this.alarmHour = DEFAULT_ALARM_HOUR;
    this.storage = storage;

    this.loadTimestamp();
    this.loadAlarmHour();
  }

  clearTimestamp() {
    logger.info('timestamp cleared');
    this.lastRun = null;
    this.storage.removeFromStorage(TIMESTAMP_KEY);
  }

  loadTimestamp() {
    const storedTimestamp = this.storage.loadFromStorage(TIMESTAMP_KEY);
    if (storedTimestamp) {
      this.lastRun = new Date(parseInt(storedTimestamp));
    }
  }

  storeTimestamp() {
    if (this.lastRun) {
      const ts = this.lastRun.getTime();
      this.storage.saveToStorage(TIMESTAMP_KEY, `${ts}`);
    }
  }

  loadAlarmHour() {
    const storedAlarmHour = this.storage.loadFromStorage(ALARM_HOUR_KEY);
    if (storedAlarmHour) {
      this.alarmHour = parseInt(storedAlarmHour, 10);
    }
  }

  storeAlarmHour() {
    this.storage.saveToStorage(ALARM_HOUR_KEY, `${this.alarmHour}`);
  }

  didRunToday() {
    const now = new Date();
    logger.info(`I have this for this.lastRun: ${this.lastRun}`);

    if (this.lastRun) {
      logger.info(
        `I will return this for didRunToday(): ${this.lastRun.toLocaleDateString() === now.toLocaleDateString()}`
      );
      return this.lastRun.toLocaleDateString() === now.toLocaleDateString();
    }

    return false;
  }

  isTimeToRun() {
    const now = new Date();
    const isPastAlarmHour = now.getHours() >= this.alarmHour;
    return !this.didRunToday() && isPastAlarmHour;
  }

  setLastRun(ts: number | Date | null) {
    if (ts === null) {
      return;
    }

    if (typeof ts === 'object') {
      this.lastRun = ts;
    } else {
      this.lastRun = new Date(ts);
    }

    this.storeTimestamp();
  }
}
