# Thundermail / Send — Deutsch. Handgeschriebener Ausschnitt für den
# End-to-End-Nachweis (Woche 1); wird später von Pontoon ersetzt.

-send-brand = Thunderbird Send
-thundermail-brand = Thundermail

send-popup-title = Mit { -send-brand } teilen
send-upload-progress =
    { $count ->
        [one] { $count } Datei wird hochgeladen…
       *[other] { $count } Dateien werden hochgeladen…
    }
send-log-out = Abmelden
send-sign-out = Abmelden
send-copy-link = Link kopieren
send-link-copied = Link kopiert
# Intentionally left untranslated so the fallback drill has a real gap:
# send-error-unknown
# Intentionally empty: must fall back to English, never render blank.
send-test-empty-pattern = { "" }

## Hochladen (#1088, Teil 1)

send-upload-in-progress-label = Dateien werden hochgeladen
send-upload-dropzone-label = Dateien hier ablegen oder klicken, um Dateien zum Hochladen auszuwählen
send-upload-dropzone-instructions = Dateien hier ablegen oder tippen, um sie hochzuladen
send-upload-selected-files =
    { $count ->
        [one] Ausgewählte Dateien ({ $count } Datei):
       *[other] Ausgewählte Dateien ({ $count } Dateien):
    }
send-upload-file-item-label = Datei { $position } von { $total }: { $fileName }, { $size }
send-upload-remove-file-label = { $fileName } aus der Upload-Liste entfernen
send-upload-completed-files =
    { $count ->
        [one] Abgeschlossene Uploads ({ $count } Datei):
       *[other] Abgeschlossene Uploads ({ $count } Dateien):
    }
send-upload-completed-item-label = Abgeschlossener Upload: { $fileName }, { $size }
send-upload-status-uploaded = Hochgeladen
send-upload-failed-files =
    { $count ->
        [one] Fehlgeschlagene Uploads ({ $count } Datei):
       *[other] Fehlgeschlagene Uploads ({ $count } Dateien):
    }
send-upload-failed-item-label = Fehlgeschlagener Upload: { $fileName }, { $size }
send-upload-status-failed = Fehlgeschlagen
send-upload-button-label =
    { $count ->
        [one] { $count } ausgewählte Datei hochladen
       *[other] { $count } ausgewählte Dateien hochladen
    }
send-upload-button =
    { $count ->
        [one] { $count } Datei hochladen
       *[other] { $count } Dateien hochladen
    }
send-upload-processing-file = { $fileName } wird verarbeitet… ({ $current }/{ $total })
send-upload-success-count =
    { $count ->
        [one] { $count } Datei erfolgreich hochgeladen
       *[other] { $count } Dateien erfolgreich hochgeladen
    }
send-upload-partial-failure =
    { $count ->
        [one] { $count } Datei hochgeladen, { $failed } fehlgeschlagen
       *[other] { $count } Dateien hochgeladen, { $failed } fehlgeschlagen
    }
send-upload-error-processing = Fehler beim Verarbeiten der Dateien: { $message }
send-upload-error-file-failed = Hochladen von { $fileName } fehlgeschlagen: { $message }
send-upload-error-unknown-detail = Unbekannter Fehler
send-upload-error-size-exceeded = Ihr Upload überschreitet die maximale Upload-Größe ({ $max }). Bitte entfernen Sie die zu großen Dateien und versuchen Sie es erneut.
send-upload-error-file-too-big = Diese Dateigröße wird nicht unterstützt. Bitte versuchen Sie es mit Dateien, die kleiner als { $max } sind.
send-upload-error-storage-limit = Mit dieser Datei würden Sie Ihr Speicherlimit überschreiten. Bitte löschen Sie einige Dateien und versuchen Sie es erneut.
send-upload-error-storage-limit-alert = Fehler beim Hochladen von { $fileName }: { send-upload-error-storage-limit }
send-upload-error-generic = Beim Hochladen Ihrer Datei ist ein Fehler aufgetreten. Bitte versuchen Sie es erneut oder melden Sie das Problem.
send-upload-error-retry = Hochladen fehlgeschlagen. Bitte versuchen Sie es erneut.
send-upload-error-keychain-locked = Hochladen nicht möglich: Die Verschlüsselungsschlüssel sind gesperrt. Bitte geben Sie Ihre Passphrase erneut ein.
send-upload-error-not-uploaded = Die Datei konnte nicht hochgeladen werden
send-upload-error-file-not-uploaded = Die Datei { $fileName } konnte nicht hochgeladen werden
send-upload-error-no-share-url = Beim Teilen wurde keine URL zurückgegeben
send-upload-error-no-share-url-store = Beim Teilen wurde keine URL zurückgegeben

send-progress-stage-idle = Wird gestartet…
send-progress-stage-hashing = Prüfsumme wird berechnet…
send-progress-stage-preparing = Wird vorbereitet…
send-progress-stage-encrypting = Wird verschlüsselt…
send-progress-stage-uploading = Wird hochgeladen…
send-progress-stage-downloading = Wird heruntergeladen…
send-progress-stage-decrypting = Wird entschlüsselt…
send-progress-stage-processing = Wird verarbeitet…
send-progress-stage-completed = Abgeschlossen
send-progress-stage-error = Fehler
send-progress-file-pending = Datei wird verarbeitet…
send-progress-status-label = { $fileName } wird verarbeitet: { $stage }, { $percent } % abgeschlossen
send-upload-uploading = Wird hochgeladen…

send-upload-step-indicator = SCHRITT { $current } VON { $total }
send-upload-button-back = Zurück
send-upload-button-cancel = Abbrechen
send-upload-button-next = Weiter
send-upload-expiration-title = Ablauf der Datei festlegen
send-upload-button-try-again = Erneut versuchen
send-upload-failed-title = Hochladen fehlgeschlagen
send-upload-failed-description = Beim Hochladen Ihrer Datei ist ein Fehler aufgetreten. Mögliche Ursachen sind Netzwerkprobleme oder Beschränkungen der Dateigröße. Bitte prüfen Sie Ihre Verbindung und versuchen Sie es erneut.
send-upload-button-create-link = Link erstellen
send-upload-expiration-description = Legen Sie fest, wann der Download-Link abläuft
send-upload-expiration-never = Läuft nie ab
send-upload-expiration-hours =
    { $count ->
        [one] Läuft in { $count } Stunde ab
       *[other] Läuft in { $count } Stunden ab
    }
send-upload-expiration-days-default =
    { $count ->
        [one] Läuft in { $count } Tag ab (Standard)
       *[other] Läuft in { $count } Tagen ab (Standard)
    }
send-upload-expiration-days =
    { $count ->
        [one] Läuft in { $count } Tag ab
       *[other] Läuft in { $count } Tagen ab
    }
send-upload-expiration-custom = Datum und Uhrzeit auswählen
send-upload-expiration-custom-field = Datum und Uhrzeit auswählen
send-upload-password-title = Dateipasswort erstellen
send-upload-password-description = Ein Dateipasswort bietet zusätzlichen Schutz, falls eine unbeabsichtigte Person Zugriff auf Ihre E-Mail erhält.
send-upload-password-protect = Diese Datei mit einem Passwort schützen (empfohlen)
send-upload-password-label = Dateipasswort
send-upload-password-placeholder = Passwort eingeben
send-upload-password-visibility =
    { $state ->
        [shown] Passwort verbergen
       *[hidden] Passwort anzeigen
    }
send-upload-password-help = Teilen Sie dieses Passwort Ihrem Empfänger über einen separaten Kommunikationsweg mit.
send-upload-success-title = Link erfolgreich erstellt
send-upload-button-close = Schließen
send-upload-success-heading = Ihre Datei wurde hochgeladen!
send-upload-success-description = Teilen Sie diesen Link mit Ihrem Empfänger. Für den Zugriff auf die Datei wird das Passwort benötigt.
send-upload-button-copy = Kopieren
