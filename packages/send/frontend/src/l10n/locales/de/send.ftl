# Thundermail / Send — Deutsch. Handgeschriebener Ausschnitt für den
# End-to-End-Nachweis (Woche 1); wird später von Pontoon ersetzt.

-send-brand = Thunderbird Send
-thundermail-brand = Thundermail
-thunderbird-brand = Thunderbird

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

## Dateiliste und Ordner (#1088, Teil 2)

send-files-title = Ihre Dateien
send-files-error-loading = Fehler beim Laden des Ordners: { $message }
send-files-button-retry = Erneut versuchen
send-files-empty-title = Keine Dateien
send-files-empty-description = Hochgeladene Dateien werden hier angezeigt.
send-files-column-name = Name
send-files-last-modified = Zuletzt geändert { $time }
send-files-delete-item-title = Element löschen?
send-files-delete-folder-title = Ordner löschen?
send-files-delete-file-title = Datei löschen?
send-files-button-new-folder = Neuer Ordner
send-files-button-rename = Umbenennen
send-files-sidebar-label = Seitenleiste der Dateiverwaltung
send-files-actions-heading = Aktionen der Dateiverwaltung
send-files-upload-heading = Dateien hochladen
send-files-upload-zone-label = Dateien zum Hochladen hierher ziehen und ablegen oder klicken, um Dateien auszuwählen
send-files-upload-zone-text =
    Dateien hier ablegen
    oder tippen, um sie hochzuladen

send-files-close-folder-info = Ordnerdetails schließen
send-files-close-file-info = Dateidetails schließen
send-files-created = Erstellt
send-files-modified = Geändert
send-files-expired = Abgelaufen
send-files-reported = Diese Datei wurde wegen Missbrauchs gemeldet. Bitte wenden Sie sich an den Support, wenn Sie glauben, dass es sich um einen Irrtum handelt.

send-share-expiration-label = Ablauf des Links
send-share-expiration-custom = Eigenes Datum und eigene Uhrzeit
send-share-password-label = Passwort
send-share-creating = Wird erstellt…
send-share-button-create-file-link = Freigabelink erstellen
send-share-button-create-folder-link = Zugriffslink erstellen
send-share-error-passwordless-flag = Der Link wurde erstellt, aber sein Passwortstatus konnte nicht aktualisiert werden.
send-share-error-create = Der Zugriffslink konnte nicht erstellt werden. Bitte versuchen Sie es erneut.
send-share-error-unexpected = Ein unerwarteter Fehler ist aufgetreten.
send-share-new-link-label = Ihr neuer Link
send-share-new-link-field = Neuer Freigabelink
send-share-copy-button =
    { $state ->
        [copied] Kopiert!
       *[idle] Kopieren
    }
send-share-new-link-notice = Dieser Link ist nur jetzt für Sie sichtbar und kann nicht wiederhergestellt werden, wenn er verloren geht. Sie können jederzeit weitere Links erstellen.
send-share-existing-links = Vorhandene Links
send-share-link-field = Freigabelink
send-share-passwordless-tooltip = Links ohne Passwort können nur beim Erstellen angezeigt werden. Sie können diesen Link löschen, um den Zugriff zu widerrufen, und jederzeit einen neuen erstellen.
send-share-link-copied = Kopiert!
send-share-delete-link = Link löschen
send-share-status-password = Passwort
send-share-status-locked = Gesperrt

send-download-ready-title = Ihre Datei kann sicher heruntergeladen werden
send-access-title = Diese Datei ist passwortgeschützt
send-access-password-label = Passwort
send-access-password-prompt = Geben Sie das Passwort ein, das Sie vom Absender erhalten haben
send-access-button-continue = Weiter
send-access-error-incorrect = Dieses Passwort ist falsch
send-access-attempts-remaining =
    { $count ->
        [one] Noch { $count } Versuch.
       *[other] Noch { $count } Versuche.
    }
send-access-error-locked = Dieser Link wurde nach zu vielen falschen Versuchen gesperrt.
send-access-error-invalid = Der Zugriffslink ist nicht mehr gültig
send-access-error-generic = Bei der Verarbeitung Ihrer Anfrage ist ein Fehler aufgetreten
send-download-file-information = DATEIINFORMATIONEN
send-download-sender = Absender
send-download-unknown-sender = Unbekannter Absender
send-download-filename = Dateiname
send-download-unknown-file = Unbekannte Datei
send-download-filesize = Dateigröße
send-download-not-available = Nicht verfügbar
send-download-view-checksum = Prüfsumme anzeigen
send-download-checksum-label = Hash (SHA256)
send-download-copy-checksum =
    { $state ->
        [copied] Kopiert!
       *[idle] In die Zwischenablage kopieren
    }
send-download-button = Herunterladen
send-download-confirm-title = Bevor Sie herunterladen
send-download-confirm-intro = Sie laden gleich eine Datei über { -send-brand } herunter.
send-download-confirm-not-scanned = Mit Send versendete Dateien sind Ende-zu-Ende-verschlüsselt und werden nicht auf Viren oder Schadsoftware geprüft.
send-download-confirm-trust = Laden Sie nur Dateien herunter, denen Sie vertrauen.
send-download-confirm-security = Schützen Sie Ihr Gerät mit Ihrer eigenen Sicherheitssoftware.
send-download-confirm-liability = MZLA Technologies ist nicht für Probleme verantwortlich, die sich aus diesem Download ergeben.
send-download-support = Hilfe
send-download-privacy-policy = Datenschutzerklärung

send-dashboard-manage-files-title = Dateien verwalten
send-dashboard-manage-files-description = Öffnen und verwalten Sie Ihren verschlüsselten Dateispeicher an einem sicheren Ort.
send-dashboard-manage-files-button = Auf Ihre Dateien zugreifen
send-dashboard-addon-description = Verschlüsselter Speicher: Verwalten Sie Ihre Dateien und Einstellungen im Send-Dashboard.
send-dashboard-addon-button = Dashboard öffnen

send-upload-error-not-signed-in = Sie sind nicht vollständig angemeldet. Bitte melden Sie sich erneut an.
send-upload-error-no-user-id = Hochladen nicht möglich: In der Sitzung fehlt eine Benutzer-ID (ownerId wäre leer).
send-upload-error-storage-limit-short = Mit dieser Datei würden Sie Ihr Speicherlimit überschreiten.
send-upload-error-too-big = Zu groß
send-upload-error-failed-for = Hochladen von { $fileName } fehlgeschlagen
send-upload-error-failed-detail = Hochladen fehlgeschlagen: { $message }
send-download-progress-downloading = Datei wird heruntergeladen
send-download-progress-decrypting = Datei wird entschlüsselt
send-download-error-no-key = Schlüssel zum Entschlüsseln nicht gefunden
send-download-error-no-pieces = Keine gültigen Dateiteile gefunden

send-login-required = Sie müssen sich mit Ihrem Mozilla-Konto anmelden. Stellen Sie sicher, dass Sie auf der Zulassungsliste für den Alpha-Zugang stehen.
send-boot-button-retry = Erneut versuchen
send-boot-cookies-blocked-title = { -thunderbird-brand } blockiert Cookies für Send
send-boot-cookies-blocked-body = Send speichert ein Cookie, damit Sie angemeldet bleiben, und Ihr Browser lehnt es derzeit ab. Öffnen Sie Einstellungen → Datenschutz & Sicherheit → Web-Inhalte und aktivieren Sie „Cookies von Websites akzeptieren“. Falls das bereits aktiviert ist, stellen Sie zusätzlich „Cookies von Drittanbietern akzeptieren“ auf „Von besuchten“. Wählen Sie dann „{ send-boot-button-retry }“.
send-boot-storage-blocked-title = { -thunderbird-brand } blockiert den Speicher für Send
send-boot-storage-blocked-body = Send bewahrt Ihren Anmeldestatus und Ihre Verschlüsselungsschlüssel im Browserspeicher auf, und Ihr Browser verweigert den Zugriff darauf. Das passiert, wenn alle Cookies blockiert werden. Öffnen Sie Einstellungen → Datenschutz & Sicherheit → Web-Inhalte, aktivieren Sie „Cookies von Websites akzeptieren“ und wählen Sie dann „{ send-boot-button-retry }“.
send-boot-app-load-failed-title = Send konnte nicht gestartet werden
send-boot-app-load-failed-body = Die Anwendung konnte nicht geladen werden. Wählen Sie „{ send-boot-button-retry }“, um die Seite neu zu laden. Wenn das immer wieder passiert, geben Sie uns bitte Bescheid.

## Navigation und App-Rahmen (#1088, Teil 3)

send-nav-dashboard = Übersicht
send-nav-manage-files = Dateien verwalten
send-nav-settings = Einstellungen
send-nav-login = Anmelden
send-nav-status = Status
send-nav-support = Brauchen Sie Hilfe? Zum Support
send-nav-ideas = Ideen?
send-nav-breadcrumb-label = Ordnerpfad
send-nav-breadcrumb-item = Zum Ordner { $folderName }
send-menu-account = Konto
send-menu-manage-subscription = Abonnement verwalten
send-menu-support = Support

## An- und Abmeldung, Einrichtungshinweis im Verfassen-Fenster

send-logout-title = Sie sind abgemeldet
send-logout-closing =
    { $count ->
        [one] Diese Seite wird in { $count } Sekunde geschlossen…
       *[other] Diese Seite wird in { $count } Sekunden geschlossen…
    }
send-logout-redirecting =
    { $count ->
        [one] Sie werden in { $count } Sekunde zur Startseite weitergeleitet…
       *[other] Sie werden in { $count } Sekunden zur Startseite weitergeleitet…
    }
send-auth-complete-title = Anmeldung abgeschlossen
send-auth-complete-body = Sie können dieses Fenster jetzt schließen und zu { -thunderbird-brand } zurückkehren.
send-locked-title = Dieser Ordner ist gesperrt
send-popup-login-title = Bitte melden Sie sich an, um fortzufahren
send-popup-login-body = Zum Anmelden wurde ein neues Fenster für Sie geöffnet.
send-popup-setup-title = Send fertig einrichten
send-popup-setup-body = Schließen Sie bitte die Einrichtung oder Wiederherstellung Ihrer Passphrase ab, um mit dem Hochladen fortzufahren.
send-popup-setup-button = Einrichtung fortsetzen

## Willkommensseite

send-welcome-signed-in = Anmeldung abgeschlossen.
send-welcome-title = Willkommen bei { -thundermail-brand }!
send-welcome-mail-title = Konto hinzugefügt
send-welcome-mail-body = Ihr { -thundermail-brand }-Konto wurde automatisch zu { -thunderbird-brand } Desktop hinzugefügt.
send-welcome-send-title = Einrichtung abschließen
send-welcome-send-body = Legen Sie als Nächstes Ihr Verschlüsselungspasswort fest. Danach können Sie verschlüsselte Dateien senden oder sie über das Kontomenü von { -thundermail-brand } verwalten.
send-welcome-send-button = Verschlüsselungspasswort festlegen

## Einstellungen und Kontoübersicht

send-settings-title = Einstellungen
send-settings-delete-failed = Beim Löschen Ihrer Daten ist ein Fehler aufgetreten. Bitte versuchen Sie es erneut.
send-dashboard-welcome = Willkommen,
send-storage-title = Send-Speicher
send-storage-used = { $used } von { $limit }
send-support-title = Brauchen Sie Hilfe?
send-support-account = Hilfe zu Ihrem Konto →
send-support-desktop = Fehlerbehebung für die Desktop-App →
send-support-encryption = Mehr über Verschlüsselung erfahren →
send-support-export = Ihre Daten exportieren →
send-security-title = Sicherheit & Datenschutz
send-security-description = Laden Sie eine Sicherung Ihres aktiven Verschlüsselungsschlüssels herunter oder setzen Sie Ihr Konto zurück, wenn Ihr Schlüssel gesperrt oder nicht mehr zugänglich ist.
send-security-key-button = Verschlüsselungsschlüssel
send-security-recover-button = Zugang wiederherstellen
send-security-locked = Der Zugriff auf Ihre Dateien ist gesperrt. Stellen Sie Ihren Verschlüsselungsschlüssel wieder her oder setzen Sie ihn zurück, um auf den Dateispeicher zuzugreifen.
send-security-learn-more = Mehr erfahren
send-dashboard-desktop-description = Um Send in { -thunderbird-brand } Desktop zu nutzen, installieren Sie die App und melden Sie sich über das { -thunderbird-brand }-Menü an.
send-dashboard-desktop-button = Herunterladen
send-dashboard-desktop-image = { -thunderbird-brand }-Desktop-App

## Send-Daten löschen

send-delete-data-title = Send-Daten löschen
send-delete-data-summary = Alle verschlüsselten Dateien in Ihrem { -thundermail-brand }-Send-Speicher dauerhaft löschen.
send-delete-data-link = Send-Daten löschen
send-delete-data-warning = Dadurch werden alle verschlüsselten Dateien in Ihrem { -thundermail-brand }-Send-Speicher dauerhaft gelöscht.
send-delete-data-subscription = Ihr { -thundermail-brand }-Abonnement ist davon nicht betroffen.
send-delete-data-export = Exportieren Sie vorher alle Dateien, die Sie behalten möchten.
send-delete-data-understand = Mir ist bewusst, dass meine verschlüsselten Dateien dauerhaft gelöscht werden.
send-delete-data-key-label = Geben Sie zur Bestätigung Ihren Verschlüsselungsschlüssel ein
send-delete-data-key-placeholder = Ihre Passphrase hier eingeben
send-delete-data-key-visibility =
    { $state ->
        [shown] Verschlüsselungsschlüssel verbergen
       *[hidden] Verschlüsselungsschlüssel anzeigen
    }
send-delete-data-button = Send-Daten löschen
send-delete-data-cancel = Abbrechen
send-delete-data-mismatch = Der Verschlüsselungsschlüssel stimmt nicht überein. Bitte versuchen Sie es erneut.
send-delete-data-invalid = Ungültiges Format des Verschlüsselungsschlüssels
send-delete-data-done-title = Ihre Send-Daten wurden gelöscht
send-delete-data-done-body = Alle verschlüsselten Dateien in Ihrem { -thundermail-brand }-Send-Speicher wurden dauerhaft gelöscht. Sie können jetzt neu beginnen.
send-delete-data-done-mail = Ihre { -thundermail-brand }-Daten sind davon nicht betroffen.
send-delete-data-done-button = Zurück zur Übersicht

## Verwaltung: Benutzerdaten löschen

send-admin-title = Benutzerdaten löschen
send-admin-loading = Benutzer werden geladen…
send-admin-load-failed = Die Benutzer konnten nicht geladen werden.
send-admin-deleted = Die Benutzerdaten von { $email } wurden gelöscht.
send-admin-back = Zurück zur Benutzerliste
send-admin-final-warning = Dadurch werden alle Daten von { $email } dauerhaft gelöscht. Dies kann nicht rückgängig gemacht werden.
send-admin-are-you-sure = Sind Sie sicher?
send-admin-delete-failed = Löschen fehlgeschlagen. Bitte versuchen Sie es erneut.
send-admin-delete-button =
    { $state ->
        [deleting] Wird gelöscht…
       *[idle] Ja, alles löschen
    }
send-admin-cancel = Abbrechen
send-admin-first-warning = Sie sind dabei, alle Daten von { $email } zu löschen.
send-admin-continue = Weiter
send-admin-hint = Wählen Sie einen Benutzer aus, um seine Daten zu löschen.
send-admin-no-users = Keine Benutzer gefunden.

## Verschlüsselungsschlüssel

send-keys-backup-title = Verschlüsselung fertig einrichten
send-keys-backup-e2e = { -send-brand } verwendet Ende-zu-Ende-Verschlüsselung.
send-keys-backup-intro = Um die Einrichtung abzuschließen, erstellen Sie einen Wiederherstellungsschlüssel. Mit diesem Schlüssel greifen Sie auf Ihre verschlüsselten Dateien zu, wenn Sie sich auf einem neuen Gerät anmelden, { -thunderbird-brand } neu installieren oder abgemeldet werden.
send-keys-backup-finalized = Ihr Schlüssel wird festgelegt, sobald Sie auf { $button } klicken.
send-keys-backup-button = Herunterladen und fortfahren
send-keys-backup-save = Bewahren Sie eine Kopie an einem sicheren Ort auf. Er wird { $emphasis }
send-keys-backup-never-stored = nie auf unseren Servern gespeichert und kann bei Verlust nicht wiederhergestellt werden.
send-keys-field-label = Verschlüsselungsschlüssel
send-keys-field-visibility =
    { $state ->
        [shown] Verbergen
       *[hidden] Anzeigen
    }
send-keys-field-regenerate = Neu erzeugen
send-keys-field-copy = Kopieren
send-keys-restore-title = Zugang mit Ihrem Verschlüsselungsschlüssel wiederherstellen
send-keys-restore-description = Geben Sie Ihren Verschlüsselungsschlüssel ein, um sich auszuweisen. Danach können Sie auf verschlüsselte Dateien zugreifen und neue Dateien hochladen.
send-keys-restore-label = Verschlüsselungsschlüssel eingeben
send-keys-restore-placeholder = Wort - Wort - Wort - Wort - Wort - Wort
send-keys-restore-continue = Weiter
send-keys-restore-cancel = Abbrechen
send-keys-restore-reset = Zugang zurücksetzen
send-keys-restore-invalid = Ungültiges Passphrase-Format
send-keys-error-word-count = 6 Wörter erwartet, { $count } erhalten
send-keys-manage-title = Verschlüsselungsschlüssel verwalten
send-keys-manage-description = Mit diesem Schlüssel stellen Sie Ihr Profil wieder her, wenn Sie sich auf einem neuen Gerät anmelden. Ihre Dateien werden immer lokal verschlüsselt, und der Schlüssel wird nie auf unseren Servern gespeichert. Speichern oder laden Sie ihn herunter und bewahren Sie ihn an einem sicheren Ort auf.
send-keys-manage-visibility =
    { $state ->
        [shown] Schlüssel verbergen
       *[hidden] Schlüssel anzeigen
    }
send-keys-manage-copy = In die Zwischenablage kopieren
send-keys-manage-download = Schlüssel herunterladen
send-keys-reset-title = Verschlüsselungsschlüssel zurücksetzen
send-keys-reset-description = Wenn Sie Ihren Verschlüsselungsschlüssel zurücksetzen, werden alle Dateien dauerhaft entfernt und Ihr verschlüsselter Speicher wird geleert. Dies kann nicht rückgängig gemacht werden.
send-keys-reset-button = Verschlüsselungsschlüssel zurücksetzen
send-keys-reset-new-key = Dies ist Ihr neuer Verschlüsselungsschlüssel. Bewahren Sie eine Kopie an einem sicheren Ort auf: Er wird nie auf unseren Servern gespeichert und kann bei Verlust nicht wiederhergestellt werden.
send-keys-reset-stays-active = Ihr aktueller Schlüssel bleibt aktiv, bis Sie auf { $button } klicken. Danach sind Dateien, die mit Ihrem bisherigen Schlüssel verschlüsselt wurden, nicht mehr zugänglich.
send-keys-reset-new-key-label = Neuer Verschlüsselungsschlüssel
send-keys-reset-understand = Mir ist bewusst, dass ich den Zugriff auf meine alten Dateien verliere.
send-keys-reset-cancel = Abbrechen
send-keys-reset-confirm = Schlüssel herunterladen und zurücksetzen
send-keys-changed-title = Warnung
send-keys-changed-body = Ihre Schlüssel sind nicht korrekt. Das kann passieren, wenn Sie Ihre Passphrase auf einem anderen Gerät zurückgesetzt haben. Klicken Sie unten, um die veralteten Schlüssel auf diesem Gerät zu entfernen. Danach werden Sie nach Ihrer neuen Passphrase gefragt, um den Zugang wiederherzustellen.
send-keys-changed-button = Neue Passphrase eingeben

## Bestätigungen

send-confirm-delete-question =
    { $type ->
        [folder] Möchten Sie den Ordner „{ $name }“ wirklich löschen?
       *[file] Möchten Sie die Datei „{ $name }“ wirklich löschen?
    }
send-confirm-delete-contents = Dabei werden auch alle darin enthaltenen Dateien und Ordner gelöscht.
send-confirm-delete-irreversible = Dies kann nicht rückgängig gemacht werden.
send-confirm-delete-button =
    { $state ->
        [deleting] Wird gelöscht…
       *[idle] Ja, löschen
    }
send-confirm-delete-cancel = Abbrechen
send-report-thanks = Vielen Dank für Ihre Meldung!
send-report-question = Sind diese Inhalte schädlich?
send-report-link = Melden
send-report-confirm = Bitte bestätigen Sie Ihre Meldung { $link }
send-report-confirm-link = hier
