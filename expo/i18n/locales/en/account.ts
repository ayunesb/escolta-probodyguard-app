// Textos de la seccion "account". El espanol (../es/account.ts) debe tener las mismas claves.
const account = {
  profile: {
    title: 'Profile',
    sections: {
      preferences: 'Preferences',
      account: 'Account',
      verification: 'Verification',
      security: 'Security',
      privacy: 'Privacy',
      session: 'Session',
    },
    language: {
      // Bilingue a proposito: quien no entiende el idioma activo igual encuentra la fila.
      title: 'Language / Idioma',
      subtitle: 'Choose the language for the app.',
    },
    rows: {
      email: 'Email',
      phone: 'Phone',
      company: 'Company',
      myDocuments: 'My documents',
      resetPassword: 'Reset password',
      privacyData: 'Privacy & data',
      privacyPolicy: 'Privacy policy',
      exportData: 'Export my data',
      signOut: 'Sign out',
      signingOut: 'Signing out…',
      deleteAccount: 'Delete account',
    },
    subtitles: {
      kycApproved: 'Verified — view or update your files',
      kycRejected: 'Not approved — upload updated files',
      kycPending: 'Upload your ID and license for review',
      resetPassword: 'Email a reset link to {{email}}',
      privacyData: 'Consent preferences and account deletion',
      exportData: 'A copy of your profile, bookings and messages (JSON)',
      deleteAccount: 'Request deletion of your account and data',
    },
    notices: {
      exportFailed: 'Your data could not be exported. Please try again.',
      resetSent: 'We sent a password reset link to {{email}}.',
      resetFailed: 'We could not send the reset email.',
    },
    signOutConfirm: {
      title: 'Sign out?',
      message: 'You will need your email and password to sign back in.',
      confirm: 'Sign out',
    },
    version: 'Version {{version}}',
  },
  protector: {
    title: 'Protector profile',
    available: 'Available for new jobs',
    hints: {
      notVerified: 'You appear to clients once your documents are verified.',
      noRate: 'Set your hourly rate to appear to clients.',
      listed: 'Clients can find and book you.',
      hidden: 'You are hidden from new bookings.',
    },
    availabilityError: 'Your availability could not be changed. Please try again.',
    rate: {
      label: 'Hourly rate (MXN)',
      placeholder: 'e.g. 250',
      error: 'Enter your rate in MXN, greater than 0',
      hintCurrent: 'Currently {{amount}} per hour, before fees.',
      hint: 'What clients pay per hour, before fees.',
      a11y: 'Hourly rate in pesos',
    },
    bio: {
      label: 'About you',
      placeholder: 'Experience, specialties, certifications…',
      a11y: 'Short bio shown to clients',
    },
    languages: 'Languages you speak',
    saved: 'Your protector profile was saved.',
    saveFailed: 'Your changes could not be saved. Please try again.',
    save: 'Save protector profile',
  },
  kyc: {
    navTitle: 'My documents',
    title: 'Verification',
    intro:
      'ID, license, insurance and vehicle files are private: only you, your company and Escolta Pro reviewers can open them. Your profile and outfit photos are shown to clients.',
    rejectedTitle: 'Your last submission was not approved',
    rejectedWithNote: 'Reviewer note: {{reason}}. Upload updated files to resubmit.',
    rejected: 'Upload updated files to resubmit for review.',
    approved: "You're verified. Changing a verification file sends your profile back for review.",
    pending: 'Your documents are waiting for review by Escolta Pro. Keep them up to date here.',
    loadError: 'We could not load your documents.',
    shownToClients: 'Shown to clients',
    private: 'Private — for verification',
    footnote: 'Images only, up to 5 MB each.',
    docs: {
      photo: { label: 'Profile photo', description: 'A clear, recent photo of your face.' },
      outfit: { label: 'Outfit photos', description: 'Your uniform or work attire.' },
      id: { label: 'Government ID', description: 'INE, passport or another valid photo ID. Both sides if applicable.' },
      license: { label: 'Security license', description: 'Your private security license or credential.' },
      insurance: { label: 'Insurance', description: 'Proof of liability insurance, if you have it.' },
      vehicle: { label: 'Vehicle documents', description: 'Registration and insurance, if you provide a vehicle.' },
    },
  },
  upload: {
    errors: {
      tooLarge: 'That file is larger than 5 MB. Choose a smaller photo.',
      unauthorized: 'Upload not allowed. Files must be images under 5 MB.',
      network: 'Connection problem while uploading. Check your network and try again.',
      generic: 'The file could not be uploaded. Please try again.',
      recordNotSaved: 'The file was uploaded but your record could not be saved, so it is not on file yet.',
      changeNotSaved: 'Your change could not be saved.',
      cameraOff: 'Camera access is off. Allow it in your device settings to take a photo.',
      libraryOff: 'Photo library access is off. Allow it in your device settings to choose a file.',
      picker: 'We could not open your photos. Please try again.',
    },
    retrySave: 'Try saving again',
    removeConfirm: {
      title: 'Remove this file?',
      // {{label}} va en minusculas; {{name}} es el nombre tal cual.
      message: 'It will no longer be part of your {{label}}.',
      confirm: 'Remove',
    },
    status: {
      onFile: '{{n}}/{{max}} on file',
      notProvided: 'Not provided',
      optional: 'Optional',
    },
    openFile: 'Open {{label}} file {{n}}',
    removeFile: 'Remove {{label}} file {{n}}',
    uploading: 'Uploading…',
    addAnother: 'Add another file',
    uploadFile: 'Upload file',
    uploadA11y: 'Upload {{label}}',
    camera: 'Camera',
    cameraA11y: 'Take a photo for {{label}}',
    library: 'Library',
    libraryA11y: 'Choose {{label}} from your library',
  },
  privacySettings: {
    navTitle: 'Privacy & data',
    title: 'Your data, your rights',
    intro:
      'Under Mexico’s Federal Law on the Protection of Personal Data Held by Private Parties (LFPDPPP) you can access, rectify, cancel or oppose the use of your personal data — your ARCO rights.',
    sections: {
      yourData: 'Your data',
      preferences: 'Preferences',
      deleteAccount: 'Delete account',
    },
    export: {
      title: 'Export my data',
      subtitle: 'Download a copy of your profile, bookings and messages',
      failed: 'Your data could not be exported. Please try again.',
    },
    policy: {
      title: 'Privacy policy',
      subtitle: 'What we collect and why',
    },
    arco: {
      title: 'Exercise your ARCO rights',
      subtitle: 'Write to {{email}}',
      emailSubject: 'ARCO request',
    },
    marketing: {
      title: 'News and offers',
      subtitle: 'Occasional emails about new services. Off by default.',
      a11y: 'News and offers emails',
      saveFailed: 'Your preference could not be saved. Please try again.',
    },
    loadFailed: 'Your preferences could not be loaded.',
    location: {
      title: 'Location',
      guard: 'Shared with your client only while you are on an active job.',
      client: 'Used to set pickup points and to show your guard during a job.',
      permission: 'Controlled by your device permission.',
      hint: 'Opens your device settings',
    },
    deleteRow: {
      title: 'Delete my account',
      subtitle: 'Request permanent deletion of your account and personal data',
    },
    deleteSheet: {
      eyebrow: 'Delete account',
      title: 'Are you sure?',
      body: 'We will send your request to Escolta Pro and sign you out. Your account and personal data are deleted within 30 days, except records the law requires us to keep (for example payment and tax records). Upcoming bookings are not cancelled or refunded automatically — cancel them first.',
      // Palabra que hay que escribir para confirmar (en mayusculas).
      keyword: 'DELETE',
      inputLabel: 'Type {{keyword}} to confirm',
      confirm: 'Delete account',
      confirmA11y: 'Confirm account deletion request',
      failed: 'Your request could not be sent. Nothing was deleted — please try again.',
    },
  },
  policy: {
    navTitle: 'Privacy policy',
    badge: 'Template · pending legal review',
    title: 'Privacy notice',
    intro:
      'How Escolta Pro collects, uses and protects your personal data, under Mexico’s Federal Law on the Protection of Personal Data Held by Private Parties (LFPDPPP).',
    draftTitle: 'Draft for counsel',
    draftMessage:
      'This notice is a template. It has not been reviewed by a lawyer and is not yet in force. Highlighted items must be completed before launch.',
    counselPrefix: 'For counsel: {{note}}',
    emailButton: 'Email {{email}}',
    lastUpdated: 'Last updated: not yet published.',
    // PLANTILLA. Redactada en lenguaje claro para un marketplace mexicano de
    // proteccion ejecutiva. Debe revisarla un abogado antes de publicarse: los
    // corchetes marcan lo que falta confirmar. {{email}} = correo de privacidad.
    sections: {
      responsible: {
        title: '1. Who is responsible for your data',
        body: [
          'Escolta Pro ([legal entity name], [registered address], Mexico) is responsible for the personal data you give us through the Escolta Pro app and website. For anything related to your privacy, write to {{email}}.',
        ],
        counsel: 'Complete the legal entity, address and the name of the data protection officer or department.',
      },
      collect: {
        title: '2. What we collect',
        bullets: [
          'Account: your name, email, phone number, preferred language and account type (client, guard or company).',
          'Guards: profile and outfit photos, government ID, security license, insurance and vehicle documents, hourly rate, availability, ratings and completed jobs.',
          'Security companies: company name and the guards on your team.',
          'Bookings: pickup and destination addresses, dates and times, service options, amounts, ratings and reviews, and messages between the client and the guard.',
          'Location: your device location while a booking is in progress (a guard’s live position is shared with their client) and when you send an emergency alert.',
          'Payments: processed by Stripe. We receive a payment reference, the amount and its status — never your full card number.',
          'Emergency alerts: the time, type of alert, the related booking and your location if your device shares it.',
          'Technical data: device type, app version and error reports that help us keep the service working.',
        ],
      },
      purposes: {
        title: '3. Why we use it',
        body: ['We use your data to provide the service you ask for (primary purposes):'],
        bullets: [
          'Create and secure your account.',
          'Verify the identity and credentials of guards before they can accept bookings.',
          'Book, schedule and carry out protection services, including live location during a job.',
          'Charge for bookings and pay guards and companies.',
          'Respond to emergency alerts and safety incidents.',
          'Provide support and resolve disputes.',
          'Meet legal, tax and accounting obligations and prevent fraud.',
        ],
      },
      optional: {
        title: '4. Optional uses',
        body: [
          'With your permission we may also send you news and offers. This is off by default, you can change it any time in Profile → Privacy & data, and saying no never affects the service.',
        ],
        counsel: 'List any analytics or advertising tools in use and whether they require consent.',
      },
      sharing: {
        title: '5. Who we share it with',
        body: ['We share only what each party needs, and we do not sell your personal data.'],
        bullets: [
          'The other side of your booking: a client sees the guard’s name, photo, rating and live location during the job; the guard sees the client’s name, pickup address and messages.',
          'The security company a guard works for, which manages that guard’s profile and documents.',
          'Providers that run the service on our behalf, under contract: Google Firebase (hosting, database and file storage) and Stripe (payments). Some of them store data outside Mexico.',
          'Authorities, when the law requires it or to protect someone’s life or safety in an emergency.',
        ],
        counsel: 'Confirm the list of processors, international transfers and whether any transfer needs your consent.',
      },
      documents: {
        title: '6. Identity documents',
        body: [
          'Government IDs, security licenses, insurance and vehicle documents are private. Only the guard, the guard’s company and Escolta Pro reviewers can open them. They are never shown to clients.',
        ],
        counsel: 'Confirm whether any data processed is “sensitive” under the LFPDPPP and, if so, how express consent is collected.',
      },
      retention: {
        title: '7. How long we keep it',
        bullets: [
          'Account data: while your account is open.',
          'After you ask us to delete your account: we delete your personal data within 30 days, except records we must keep by law.',
          'Booking, payment and invoicing records: for the period tax law requires (generally five years).',
          'Verification documents: while the guard is active, then [retention period].',
          'Location recorded during jobs and emergency alerts: [retention period].',
        ],
        counsel: 'Define the bracketed retention periods and confirm the tax retention period.',
      },
      arco: {
        title: '8. Your ARCO rights',
        body: [
          'You can Access your data, Rectify it if it is wrong, Cancel it (ask us to delete it) and Oppose specific uses. You can also withdraw a consent you gave us.',
          'To make a request, email {{email}} with your full name, the email on your account, a copy of your ID (or your representative’s, with proof of representation) and a clear description of what you want. We answer within 20 business days and, if your request is granted, carry it out within the following 15 business days.',
          'You can also download a copy of your data and request account deletion yourself in Profile → Privacy & data.',
        ],
        counsel: 'Confirm response periods and requirements against the LFPDPPP in force.',
      },
      storage: {
        title: '9. Browser storage',
        body: [
          'The web version keeps you signed in and remembers your preferences using your browser’s storage. We do not use advertising cookies.',
        ],
        counsel: 'Confirm with engineering the complete list of cookies and similar technologies.',
      },
      security: {
        title: '10. How we protect it',
        body: [
          'Data travels encrypted, access is limited by role (for example, only reviewers can see identity documents) and every document upload and verification decision is logged.',
        ],
      },
      changes: {
        title: '11. Changes to this notice',
        body: [
          'If we change this notice we will publish the new version here and tell you in the app before important changes take effect.',
        ],
      },
      complaints: {
        title: '12. If you have a complaint',
        body: [
          'Write to us first at {{email}}. If you believe your rights have not been respected, you can go to the Mexican federal authority responsible for personal data protection.',
        ],
        counsel: 'Name the competent authority and its contact details after the 2025 reform of the LFPDPPP.',
      },
    },
  },
  biometric: {
    fingerprint: 'Fingerprint',
    faceId: 'Face ID',
    iris: 'Iris',
    generic: 'Biometric',
    authenticate: 'Authenticate to continue',
    usePasscode: 'Use passcode',
    enableLogin: 'Enable biometric login',
    enableAuth: 'Enable biometric authentication',
  },
};

export default account;
