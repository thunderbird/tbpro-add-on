import winkNLP, { type ItsHelpers, type WinkMethods } from 'wink-nlp';
import type Model from 'wink-eng-lite-web-model';
import {
  default as createClassifier,
  type ClassifierStats,
  type NaiveBayesTextClassifier,
} from 'wink-naive-bayes-text-classifier';
import makePrepText from '@/lib/prepText';

import type { EmailMessage } from '@/lib/Messages';
import {
  CONTACT_WEIGHTS,
  FREQUENCY_LABELS,
  FREQUENCY_THRESHOLDS,
  FREQUENCY_WEIGHTS,
} from '@/lib/weights';
import type { FrequencyMap } from '@/lib/FrequencyMap';

export enum CLASSIFICATION {
  IMPORTANT = 'IMPORTANT',
  NOT_IMPORTANT = 'NOT_IMPORTANT',
}

export type AddressConfiguration = {
  addressBookEmails: Set<string>;
  classificationFrequencyMap: Record<CLASSIFICATION, FrequencyMap>;
};

type MessageTrainingOptions = {
  classification: CLASSIFICATION;
  addressConfig: AddressConfiguration;
  trainOnRecipients?: boolean;
};

export type EmailMessageWithPrediction = EmailMessage & {
  label?: string;
  odds?: Record<string, number>;
};

export class ClassifierError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ClassifierError';
    this.message = message;
  }
}

/**
 * A class for classifying email importance using a Naive Bayes classifier.
 * This classifier is trained on email messages and can predict whether an email is important or not.
 */
export class ImportanceClassifier {
  private NLP: WinkMethods;
  private its: ItsHelpers;
  private classifier: NaiveBayesTextClassifier;
  private hasConsolidated: boolean = false;

  constructor(model: typeof Model) {
    this.NLP = winkNLP(model);
    this.its = this.NLP.its;
    this.classifier = createClassifier();
    this.initClassifier();
  }

  initClassifier() {
    this.classifier.defineConfig({ smoothingFactor: 0.5 });
    this.classifier.definePrepTasks([makePrepText(this.NLP)]);
    this.hasConsolidated = false;
  }

  private getAddressWeight(frequency: number): number {
    const thresholds = FREQUENCY_THRESHOLDS;
    const weights = FREQUENCY_WEIGHTS;
    const labels = FREQUENCY_LABELS;

    if (frequency > thresholds[labels.HIGH]) return weights[labels.HIGH];
    if (frequency > thresholds[labels.MEDIUM]) return weights[labels.MEDIUM];
    if (frequency > thresholds[labels.LOW]) return weights[labels.LOW];
    return 1;
  }

  public stats(): ClassifierStats {
    if (!this.hasConsolidated) {
      this.classifier.consolidate();
      this.hasConsolidated = true;
    }
    return this.classifier.stats();
  }

  /**
   *
   * @param {EmailMessage} message - The email message to classify
   * @returns {Record<string, number>} An object with classification keys and their scores
   */
  public getScore(message: EmailMessage): EmailMessageWithPrediction {
    if (!this.hasConsolidated) {
      this.classifier.consolidate();
      this.hasConsolidated = true;
    }

    const result: EmailMessageWithPrediction = {
      ...message,
    };
    const addressString = message.author.address;
    const scoringString = `
      ${addressString}
      ${message.subject}
      ${message.body}
    `;

    const label = this.classifier.predict(scoringString);
    const scores = this.classifier.computeOdds(scoringString);
    result.odds = {};
    for (const [category, score] of scores) {
      result.odds[category] = score;
    }
    result.label = label;
    return result;
  }

  public async _trainOne(message: EmailMessage, options: MessageTrainingOptions) {
    const { classification, trainOnRecipients, addressConfig } = options;

    // TODO: Consider whether to include ccList and bccList
    const addressString = trainOnRecipients
      ? message.recipients.map((r) => r.address).join(' ')
      : message.author.address;
    let addressWeight = 1;

    if (addressConfig) {
      const frequencyMap = addressConfig.classificationFrequencyMap[classification];
      const addressBookEmails = addressConfig.addressBookEmails;
      const emails = trainOnRecipients ? message.recipients : [message.author];

      addressWeight = emails.reduce((weight, email) => {
        const emailFrequency = frequencyMap.get(email.address) || 0;
        const isAddressBookEmail = addressBookEmails.has(email.address);

        // If not in address book, don't add any weight
        const inAddressBookWeight = isAddressBookEmail ? CONTACT_WEIGHTS.CONTACT_IN_ADDRESSBOOK : 0;
        return weight + this.getAddressWeight(emailFrequency) + inAddressBookWeight;
      }, 0);

      // Normalize weight
      addressWeight = Math.min(Math.max(addressWeight, 0.1), 10);
    }

    const trainingString: string = `
        ${addressString}
        ${message.subject}
        ${message.body}
      `;

    // Apply the weight by repeating the training
    const repetitions = Math.round(addressWeight);
    for (let i = 0; i < repetitions; i++) {
      this.classifier.learn(trainingString, classification);
    }
  }

  /**
   * Trains the classifier with balanced datasets of important and not important emails.
   *
   * @param {Record<CLASSIFICATION, EmailMessage[]>} trainingObjects - An object containing arrays of EmailMessages for each classification
   * @param {AddressConfiguration} addressConfig - Configuration object for address book and frequency maps
   * @returns {Promise<void>}
   */
  public async trainBalanced(
    trainingObjects: Record<CLASSIFICATION, EmailMessage[]>,
    addressConfig: AddressConfiguration
  ): Promise<void> {
    console.log(`Creating new classifier to avoid re-training after consolidation`);
    this.classifier = createClassifier();
    this.initClassifier();

    const unimportantEmails = trainingObjects[CLASSIFICATION.NOT_IMPORTANT];
    const importantEmails = trainingObjects[CLASSIFICATION.IMPORTANT];
    const unimportantLength = unimportantEmails.length;
    const importantLength = importantEmails.length;

    const minLength = Math.min(unimportantLength, importantLength); // Get the length of the shorter array
    for (let i = 0; i < minLength; i++) {
      await this._trainOne(unimportantEmails[i], {
        classification: CLASSIFICATION.NOT_IMPORTANT,
        addressConfig,
      });
      await this._trainOne(importantEmails[i], {
        classification: CLASSIFICATION.IMPORTANT,
        addressConfig,
      });
    }
  }
}
