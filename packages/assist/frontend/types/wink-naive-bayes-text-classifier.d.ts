declare module 'wink-naive-bayes-text-classifier' {
  export default function create(): NaiveBayesTextClassifier;

  export interface NaiveBayesTextClassifier {
    /**
     * Defines the text preparation tasks for transforming raw input into tokens
     * used during learning, prediction, and evaluation.
     * @param tasks An array of functions to prepare text.
     * @returns The number of tasks defined.
     */
    definePrepTasks(tasks: ((input: string) => string[])[]): number;

    /**
     * Configures the classifier settings.
     * @param config The configuration object containing `considerOnlyPresence` and `smoothingFactor`.
     * @returns Always true.
     * @throws Error if configuration is set after learning has started.
     */
    defineConfig(config: ClassifierConfig): boolean;

    /**
     * Learns from an example pair of input and label.
     * @param input The training document as a string or an array of tokens.
     * @param label The label associated with the document.
     * @returns Always true.
     * @throws Error if the learning has already been consolidated.
     */
    learn(input: string | string[], label: string): boolean;

    /**
     * Consolidates the learned data, preparing the classifier for evaluation and prediction.
     * @returns Always true.
     * @throws Error if insufficient data for meaningful consolidation is present.
     */
    consolidate(): boolean;

    /**
     * Predicts the label for the given input.
     * @param input The input document as a string or array of tokens.
     * @returns The predicted label.
     * @throws Error if consolidation has not been done.
     */
    predict(input: string | string[]): string;

    /**
     * Computes the odds for every label for the given input, returning
     * an array of label-odds pairs in descending order of odds.
     * @param input The input document as a string or array of tokens.
     * @returns An array of `[label, odds]` pairs.
     * @throws Error if consolidation has not been done.
     */
    computeOdds(input: string | string[]): [string, number][];

    /**
     * Evaluates the classifier's learning using test data, updating the confusion matrix.
     * @param input The test document as a string or array of tokens.
     * @param label The true label for the input.
     * @returns Always true.
     * @throws Error if the label is unknown.
     */
    evaluate(input: string | string[], label: string): boolean;

    /**
     * Returns detailed metrics including precision, recall, and F-measure.
     * @returns An object containing macro-averaged and label-wise metrics.
     * @throws Error if metrics are requested before evaluation.
     */
    metrics(): ClassifierMetrics;

    /**
     * Returns statistics about the learned data.
     * @returns An object containing label-wise sample and word counts, and vocabulary size.
     */
    stats(): ClassifierStats;

    /**
     * Exports the classifier's state as a JSON string.
     * @returns A JSON string representing the classifier's state.
     */
    exportJSON(): string;

    /**
     * Imports a previously exported classifier state from a JSON string.
     * @param json The JSON string representing the classifier's state.
     * @returns Always true.
     * @throws Error if the JSON is invalid.
     */
    importJSON(json: string): boolean;

    /**
     * Resets the classifier, clearing all learned data but preserving preparatory tasks.
     * @returns Always true.
     */
    reset(): boolean;
  }

  export interface ClassifierConfig {
    considerOnlyPresence?: boolean; // Binarized model if true
    smoothingFactor?: number; // Value for additive smoothing (0 to 1, default 1)
  }

  export interface ClassifierMetrics {
    avgPrecision: number;
    avgRecall: number;
    avgFMeasure: number;
    details: {
      confusionMatrix: Record<string, Record<string, number>>;
      precision: Record<string, number>;
      recall: Record<string, number>;
      fmeasure: Record<string, number>;
    };
  }

  export interface ClassifierStats {
    labelWiseSamples: Record<string, number>;
    labelWiseWords: Record<string, number>;
    vocabulary: number;
  }
}
