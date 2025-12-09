import { type Ref, onMounted, ref, watch } from 'vue';

export interface AsciiPDFTexts {
  logoText: Ref<string>;
  logoBadge: Ref<string>;
  title: Ref<string>;
  warningText: Ref<string>;
  bullet1: Ref<string>;
  bullet2: Ref<string>;
  bullet3: Ref<string>;
  instruction: Ref<string>;
  formTitle: Ref<string>;
  accountLabel: Ref<string>;
  keyLabel: Ref<string>;
  generatedLabel: Ref<string>;
  learnMore: Ref<string>;
  email: Ref<string>;
  passphrase: Ref<string>;
  date: Ref<string>;
}

export function useAsciiPDF(texts: AsciiPDFTexts) {
  const asciiContent = ref('');

  const generateAsciiPDF = () => {
    const outerWidth = 74; // Content width inside outer border

    // Helper to create a line with proper padding inside outer border
    const outerLine = (content: string) => {
      const pad = Math.max(0, outerWidth - content.length);
      return '│ ' + content + ' '.repeat(pad) + ' │';
    };

    // Helper to center text
    const centerText = (text: string, w: number) => {
      const leftPad = Math.max(0, Math.floor((w - text.length) / 2));
      const rightPad = Math.max(0, w - text.length - leftPad);
      return ' '.repeat(leftPad) + text + ' '.repeat(rightPad);
    };

    // Build ASCII document
    const ascii: string[] = [];

    // Outer border top
    ascii.push('┌─' + '─'.repeat(outerWidth) + '─┐');

    // Header
    const headerBox = '═'.repeat(42);
    const logoLine = `${texts.logoText.value} ${texts.logoBadge.value}`;
    ascii.push(outerLine(centerText('╔' + headerBox + '╗', outerWidth)));
    ascii.push(
      outerLine(centerText('║' + centerText(logoLine, 42) + '║', outerWidth))
    );
    ascii.push(
      outerLine(
        centerText('║' + centerText(texts.title.value, 42) + '║', outerWidth)
      )
    );
    ascii.push(outerLine(centerText('╚' + headerBox + '╝', outerWidth)));
    ascii.push(outerLine(''));

    // Shield warning - word wrap
    const wrapText = (text: string, maxWidth: number) => {
      const words = text.split(' ');
      const lines: string[] = [];
      let currentLine = '';

      for (const word of words) {
        const testLine = currentLine + (currentLine ? ' ' : '') + word;
        if (testLine.length <= maxWidth) {
          currentLine = testLine;
        } else {
          if (currentLine) lines.push(currentLine);
          currentLine = word;
        }
      }
      if (currentLine) lines.push(currentLine);
      return lines;
    };

    wrapText(texts.warningText.value, outerWidth).forEach((line) => {
      ascii.push(outerLine(line));
    });
    ascii.push(outerLine(''));

    // Info bullets
    wrapText('• ' + texts.bullet1.value, outerWidth).forEach((line, i) => {
      ascii.push(outerLine(i === 0 ? line : '  ' + line));
    });
    ascii.push(outerLine(''));
    wrapText('• ' + texts.bullet2.value, outerWidth).forEach((line, i) => {
      ascii.push(outerLine(i === 0 ? line : '  ' + line));
    });
    ascii.push(outerLine(''));
    wrapText('• ' + texts.bullet3.value, outerWidth).forEach((line, i) => {
      ascii.push(outerLine(i === 0 ? line : '  ' + line));
    });
    ascii.push(outerLine(''));

    // Instruction
    wrapText(texts.instruction.value, outerWidth).forEach((line) => {
      ascii.push(outerLine(line));
    });
    ascii.push(outerLine(''));

    // Form card - nested box
    const formWidth = outerWidth - 4; // 70 chars for content inside form box
    const formLine = (content: string) => {
      const pad = Math.max(0, formWidth - content.length);
      return '  │' + content + ' '.repeat(pad) + '│';
    };

    ascii.push(outerLine('  ┌' + '─'.repeat(formWidth) + '┐'));
    ascii.push(
      outerLine(formLine(centerText(texts.formTitle.value, formWidth)))
    );
    ascii.push(outerLine('  ├' + '─'.repeat(formWidth) + '┤'));
    ascii.push(outerLine(formLine('')));

    // Account field
    ascii.push(outerLine(formLine('  ' + texts.accountLabel.value)));

    const inputWidth = formWidth - 6; // 64 chars for content inside input box
    const inputLine = (content: string) => {
      const pad = Math.max(0, inputWidth - content.length);
      return '  │  │ ' + content + ' '.repeat(pad) + ' │';
    };

    ascii.push(outerLine('  │  ┌' + '─'.repeat(inputWidth + 2) + '┐'));
    ascii.push(outerLine(inputLine('✉ ' + texts.email.value)));
    ascii.push(outerLine('  │  └' + '─'.repeat(inputWidth + 2) + '┘'));
    ascii.push(outerLine(formLine('')));

    // Key field
    ascii.push(outerLine(formLine('  ' + texts.keyLabel.value)));
    ascii.push(outerLine('  │  ┌' + '─'.repeat(inputWidth + 2) + '┐'));
    ascii.push(outerLine(inputLine('🔒 ' + texts.passphrase.value)));
    ascii.push(outerLine('  │  └' + '─'.repeat(inputWidth + 2) + '┘'));
    ascii.push(outerLine(formLine('')));

    // Generated date
    ascii.push(outerLine('  ├' + '─'.repeat(formWidth) + '┤'));
    ascii.push(
      outerLine(
        formLine('  ' + texts.generatedLabel.value + ': ' + texts.date.value)
      )
    );
    ascii.push(outerLine('  └' + '─'.repeat(formWidth) + '┘'));

    ascii.push(outerLine(''));
    ascii.push(outerLine(texts.learnMore.value));

    // Outer border bottom
    ascii.push('└─' + '─'.repeat(outerWidth) + '─┘');

    asciiContent.value = ascii.join('\n');
  };

  onMounted(() => {
    generateAsciiPDF();
  });

  // Watch for changes in any text props and regenerate
  watch(
    [
      texts.logoText,
      texts.logoBadge,
      texts.title,
      texts.warningText,
      texts.bullet1,
      texts.bullet2,
      texts.bullet3,
      texts.instruction,
      texts.formTitle,
      texts.accountLabel,
      texts.keyLabel,
      texts.generatedLabel,
      texts.learnMore,
      texts.email,
      texts.passphrase,
      texts.date,
    ],
    () => {
      generateAsciiPDF();
    }
  );

  return {
    asciiContent,
    generateAsciiPDF,
  };
}
