// // Load wink nlp and its model
// import winkNLP from 'wink-nlp';
// // Load language model
// import model from 'wink-eng-lite-web-model';
// const nlp = winkNLP(model);
import striptags from 'striptags';
import type { WinkMethods } from 'wink-nlp';

export default function makePrepText(nlp: WinkMethods) {
  const its = nlp.its;
  function prepText(text: string) {
    const tokens: string[] = [];
    const textWithoutHTMLTags = striptags(text);

    nlp
      .readDoc(textWithoutHTMLTags)
      .tokens()
      // Use only words ignoring punctuations etc and from them remove stop words
      .filter((t) => t.out(its.type) === 'word' && !t.out(its.stopWordFlag))
      // Handle negation and extract stem of the word
      // @ts-ignore - TODO: check if updated typings for wink-nlp are available
      .each((t) => tokens.push(t.out(its.negationFlag) ? '!' + t.out(its.stem) : t.out(its.stem)));

    return tokens;
  }

  return prepText;
}
