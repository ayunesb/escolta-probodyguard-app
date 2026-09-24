import type en from '../en/account';
import type { Translation } from '../../types';

const account: Translation<typeof en> = {
  profile: {
    title: 'Perfil',
    sections: {
      preferences: 'Preferencias',
      account: 'Cuenta',
      verification: 'Verificación',
      security: 'Seguridad',
      privacy: 'Privacidad',
      session: 'Sesión',
    },
    language: {
      title: 'Idioma / Language',
      subtitle: 'Elija el idioma de la aplicación.',
    },
    rows: {
      email: 'Correo',
      phone: 'Teléfono',
      company: 'Empresa',
      myDocuments: 'Mis documentos',
      resetPassword: 'Restablecer contraseña',
      privacyData: 'Privacidad y datos',
      privacyPolicy: 'Aviso de privacidad',
      exportData: 'Exportar mis datos',
      signOut: 'Cerrar sesión',
      signingOut: 'Cerrando sesión…',
      deleteAccount: 'Eliminar cuenta',
    },
    subtitles: {
      kycApproved: 'Verificado: consulte o actualice sus archivos',
      kycRejected: 'No aprobado: suba archivos actualizados',
      kycPending: 'Suba su identificación y su licencia para revisión',
      resetPassword: 'Enviar un enlace para restablecerla a {{email}}',
      privacyData: 'Preferencias de consentimiento y eliminación de la cuenta',
      exportData: 'Una copia de su perfil, reservas y mensajes (JSON)',
      deleteAccount: 'Solicite la eliminación de su cuenta y sus datos',
    },
    notices: {
      exportFailed: 'No se pudieron exportar sus datos. Inténtelo de nuevo.',
      resetSent: 'Enviamos un enlace para restablecer la contraseña a {{email}}.',
      resetFailed: 'No pudimos enviar el correo para restablecer la contraseña.',
    },
    signOutConfirm: {
      title: '¿Cerrar sesión?',
      message: 'Necesitará su correo electrónico y su contraseña para volver a entrar.',
      confirm: 'Cerrar sesión',
    },
    version: 'Versión {{version}}',
  },
  protector: {
    title: 'Perfil de escolta',
    available: 'Disponible para servicios',
    hints: {
      notVerified: 'Aparecerá para los clientes cuando se verifiquen sus documentos.',
      noRate: 'Fije su tarifa por hora para aparecer ante los clientes.',
      listed: 'Los clientes pueden encontrarle y reservar con usted.',
      hidden: 'No aparece para nuevas reservas.',
    },
    availabilityError: 'No se pudo cambiar su disponibilidad. Inténtelo de nuevo.',
    rate: {
      label: 'Tarifa por hora (MXN)',
      placeholder: 'p. ej. 250',
      error: 'Escriba su tarifa en MXN, mayor que 0',
      hintCurrent: 'Actualmente {{amount}} por hora, sin cargos.',
      hint: 'Lo que pagan los clientes por hora, sin cargos.',
      a11y: 'Tarifa por hora en pesos',
    },
    bio: {
      label: 'Sobre usted',
      placeholder: 'Experiencia, especialidades, certificaciones…',
      a11y: 'Breve presentación que ven los clientes',
    },
    languages: 'Idiomas que habla',
    saved: 'Se guardó su perfil de escolta.',
    saveFailed: 'No se pudieron guardar sus cambios. Inténtelo de nuevo.',
    save: 'Guardar perfil de escolta',
  },
  kyc: {
    navTitle: 'Mis documentos',
    title: 'Verificación',
    intro:
      'Su identificación, licencia, seguro y documentos del vehículo son privados: solo usted, su empresa y los revisores de Escolta Pro pueden abrirlos. Su foto de perfil y las fotos de su uniforme se muestran a los clientes.',
    rejectedTitle: 'Su último envío no fue aprobado',
    rejectedWithNote: 'Nota del revisor: {{reason}}. Suba archivos actualizados para enviarlos de nuevo.',
    rejected: 'Suba archivos actualizados para enviarlos de nuevo a revisión.',
    approved: 'Su perfil está verificado. Si cambia un archivo de verificación, su perfil vuelve a revisión.',
    pending: 'Sus documentos esperan la revisión de Escolta Pro. Manténgalos actualizados aquí.',
    loadError: 'No pudimos cargar sus documentos.',
    shownToClients: 'Visible para los clientes',
    private: 'Privado: para verificación',
    footnote: 'Solo imágenes, de hasta 5 MB cada una.',
    docs: {
      photo: { label: 'Foto de perfil', description: 'Una foto reciente y nítida de su rostro.' },
      outfit: { label: 'Fotos del uniforme', description: 'Su uniforme o ropa de trabajo.' },
      id: {
        label: 'Identificación oficial',
        description: 'INE, pasaporte u otra identificación oficial vigente con fotografía. Ambos lados, si aplica.',
      },
      license: { label: 'Licencia de seguridad', description: 'Su licencia o credencial de seguridad privada.' },
      insurance: { label: 'Seguro', description: 'Comprobante de seguro de responsabilidad civil, si cuenta con uno.' },
      vehicle: { label: 'Documentos del vehículo', description: 'Tarjeta de circulación y seguro, si aporta un vehículo.' },
    },
  },
  upload: {
    errors: {
      tooLarge: 'Ese archivo pesa más de 5 MB. Elija una foto más pequeña.',
      unauthorized: 'No se permite subir este archivo. Deben ser imágenes de menos de 5 MB.',
      network: 'Hubo un problema de conexión al subir el archivo. Revise su red e inténtelo de nuevo.',
      generic: 'No se pudo subir el archivo. Inténtelo de nuevo.',
      recordNotSaved: 'El archivo se subió, pero no se pudo guardar su registro, así que aún no consta en su expediente.',
      changeNotSaved: 'No se pudo guardar su cambio.',
      cameraOff: 'El acceso a la cámara está desactivado. Actívelo en los ajustes de su dispositivo para tomar una foto.',
      libraryOff: 'El acceso a sus fotos está desactivado. Actívelo en los ajustes de su dispositivo para elegir un archivo.',
      picker: 'No pudimos abrir sus fotos. Inténtelo de nuevo.',
    },
    retrySave: 'Guardar de nuevo',
    removeConfirm: {
      title: '¿Quitar este archivo?',
      message: 'Dejará de formar parte de «{{name}}».',
      confirm: 'Quitar',
    },
    status: {
      onFile: '{{n}}/{{max}} cargados',
      notProvided: 'Sin enviar',
      optional: 'Opcional',
    },
    openFile: 'Abrir archivo {{n}} de {{label}}',
    removeFile: 'Quitar archivo {{n}} de {{label}}',
    uploading: 'Subiendo…',
    addAnother: 'Agregar otro archivo',
    uploadFile: 'Subir archivo',
    uploadA11y: 'Subir {{label}}',
    camera: 'Cámara',
    cameraA11y: 'Tomar una foto para {{label}}',
    library: 'Galería',
    libraryA11y: 'Elegir {{label}} de su galería',
  },
  privacySettings: {
    navTitle: 'Privacidad y datos',
    title: 'Sus datos, sus derechos',
    intro:
      'Conforme a la Ley Federal de Protección de Datos Personales en Posesión de los Particulares (LFPDPPP), usted puede acceder a sus datos personales, rectificarlos, cancelarlos u oponerse a su uso: sus derechos ARCO.',
    sections: {
      yourData: 'Sus datos',
      preferences: 'Preferencias',
      deleteAccount: 'Eliminar cuenta',
    },
    export: {
      title: 'Exportar mis datos',
      subtitle: 'Descargue una copia de su perfil, reservas y mensajes',
      failed: 'No se pudieron exportar sus datos. Inténtelo de nuevo.',
    },
    policy: {
      title: 'Aviso de privacidad',
      subtitle: 'Qué datos recabamos y para qué',
    },
    arco: {
      title: 'Ejercer sus derechos ARCO',
      subtitle: 'Escriba a {{email}}',
      emailSubject: 'Solicitud ARCO',
    },
    marketing: {
      title: 'Novedades y ofertas',
      subtitle: 'Correos sobre nuevos servicios. Desactivado por defecto.',
      a11y: 'Correos de novedades y ofertas',
      saveFailed: 'No se pudo guardar su preferencia. Inténtelo de nuevo.',
    },
    loadFailed: 'No se pudieron cargar sus preferencias.',
    location: {
      title: 'Ubicación',
      guard: 'Solo se comparte con su cliente durante un servicio activo.',
      client: 'Para fijar la recogida y ver a su escolta durante el servicio.',
      permission: 'Se controla con el permiso de ubicación de su dispositivo.',
      hint: 'Abre los ajustes de su dispositivo',
    },
    deleteRow: {
      title: 'Eliminar mi cuenta',
      subtitle: 'Solicite la eliminación definitiva de su cuenta y sus datos',
    },
    deleteSheet: {
      eyebrow: 'Eliminar cuenta',
      title: '¿Confirma la eliminación?',
      body: 'Enviaremos su solicitud a Escolta Pro y cerraremos su sesión. Su cuenta y sus datos personales se eliminan en un plazo de 30 días, salvo los registros que la ley nos obliga a conservar (por ejemplo, de pagos e impuestos). Las reservas próximas no se cancelan ni se reembolsan automáticamente; cancélelas antes.',
      keyword: 'ELIMINAR',
      inputLabel: 'Escriba {{keyword}} para confirmar',
      // Corto a proposito: con el icono, "Eliminar cuenta" llenaba el boton a 375 px.
      confirm: 'Eliminar',
      confirmA11y: 'Confirmar la solicitud de eliminación de la cuenta',
      failed: 'No se pudo enviar su solicitud. No se eliminó nada; inténtelo de nuevo.',
    },
  },
  policy: {
    navTitle: 'Aviso de privacidad',
    badge: 'Plantilla · pendiente de revisión legal',
    title: 'Aviso de privacidad',
    intro:
      'Cómo Escolta Pro recaba, usa y protege sus datos personales, conforme a la Ley Federal de Protección de Datos Personales en Posesión de los Particulares (LFPDPPP).',
    draftTitle: 'Borrador para revisión legal',
    draftMessage:
      'Este aviso es una plantilla. Ningún abogado lo ha revisado y aún no está vigente. Los puntos resaltados deben completarse antes del lanzamiento.',
    counselPrefix: 'Para revisión legal: {{note}}',
    emailButton: 'Escribir a {{email}}',
    lastUpdated: 'Última actualización: aún no publicado.',
    sections: {
      responsible: {
        title: '1. Quién es responsable de sus datos',
        body: [
          'Escolta Pro ([razón social], [domicilio], México) es responsable de los datos personales que usted nos proporciona a través de la aplicación y el sitio web de Escolta Pro. Para cualquier asunto relacionado con su privacidad, escriba a {{email}}.',
        ],
        counsel:
          'Completar la razón social, el domicilio y el nombre de la persona o del departamento encargado de la protección de datos personales.',
      },
      collect: {
        title: '2. Qué datos recabamos',
        bullets: [
          'Cuenta: su nombre, correo electrónico, número de teléfono, idioma preferido y tipo de cuenta (cliente, escolta o empresa).',
          'Escoltas: fotos de perfil y del uniforme, identificación oficial, licencia de seguridad, documentos del seguro y del vehículo, tarifa por hora, disponibilidad, calificaciones y servicios completados.',
          'Empresas de seguridad: nombre de la empresa y los escoltas de su equipo.',
          'Reservas: direcciones de recogida y de destino, fechas y horarios, opciones del servicio, montos, calificaciones y reseñas, y los mensajes entre el cliente y el escolta.',
          'Ubicación: la ubicación de su dispositivo mientras una reserva está en curso (la posición en vivo del escolta se comparte con su cliente) y cuando envía una alerta de emergencia.',
          'Pagos: los procesa Stripe. Recibimos una referencia de pago, el monto y su estado; nunca el número completo de su tarjeta.',
          'Alertas de emergencia: la hora, el tipo de alerta, la reserva relacionada y su ubicación, si su dispositivo la comparte.',
          'Datos técnicos: tipo de dispositivo, versión de la aplicación e informes de errores que nos ayudan a mantener el servicio en funcionamiento.',
        ],
      },
      purposes: {
        title: '3. Para qué los usamos',
        body: ['Usamos sus datos para prestar el servicio que usted solicita (finalidades primarias):'],
        bullets: [
          'Crear y proteger su cuenta.',
          'Verificar la identidad y las credenciales de los escoltas antes de que puedan aceptar reservas.',
          'Reservar, programar y prestar servicios de protección, incluida la ubicación en vivo durante el servicio.',
          'Cobrar las reservas y pagar a escoltas y empresas.',
          'Atender alertas de emergencia e incidentes de seguridad.',
          'Brindar soporte y resolver controversias.',
          'Cumplir obligaciones legales, fiscales y contables, y prevenir fraudes.',
        ],
      },
      optional: {
        title: '4. Usos opcionales',
        body: [
          'Con su permiso, también podemos enviarle novedades y ofertas. Esta opción está desactivada de forma predeterminada, puede cambiarla en cualquier momento en Perfil → Privacidad y datos, y negarse nunca afecta el servicio.',
        ],
        counsel: 'Enumerar las herramientas de analítica o de publicidad que se usen y si requieren consentimiento.',
      },
      sharing: {
        title: '5. Con quién los compartimos',
        body: ['Compartimos solo lo que cada parte necesita y no vendemos sus datos personales.'],
        bullets: [
          'La otra parte de su reserva: el cliente ve el nombre, la foto, la calificación y la ubicación en vivo del escolta durante el servicio; el escolta ve el nombre del cliente, la dirección de recogida y los mensajes.',
          'La empresa de seguridad para la que trabaja el escolta, que administra el perfil y los documentos de ese escolta.',
          'Proveedores que operan el servicio por cuenta nuestra, bajo contrato: Google Firebase (alojamiento, base de datos y almacenamiento de archivos) y Stripe (pagos). Algunos de ellos almacenan datos fuera de México.',
          'Autoridades, cuando la ley lo exija o para proteger la vida o la seguridad de una persona en una emergencia.',
        ],
        counsel:
          'Confirmar la lista de encargados, las transferencias internacionales y si alguna transferencia requiere el consentimiento del titular.',
      },
      documents: {
        title: '6. Documentos de identidad',
        body: [
          'Las identificaciones oficiales, las licencias de seguridad y los documentos del seguro y del vehículo son privados. Solo el escolta, su empresa y los revisores de Escolta Pro pueden abrirlos. Nunca se muestran a los clientes.',
        ],
        counsel:
          'Confirmar si algún dato tratado es «sensible» conforme a la LFPDPPP y, en su caso, cómo se recaba el consentimiento expreso.',
      },
      retention: {
        title: '7. Cuánto tiempo los conservamos',
        bullets: [
          'Datos de la cuenta: mientras su cuenta siga abierta.',
          'Después de que nos pida eliminar su cuenta: eliminamos sus datos personales en un plazo de 30 días, salvo los registros que la ley nos obliga a conservar.',
          'Registros de reservas, pagos y facturación: durante el plazo que exige la legislación fiscal (por lo general, cinco años).',
          'Documentos de verificación: mientras el escolta esté activo y, después, [plazo de conservación].',
          'Ubicación registrada durante los servicios y las alertas de emergencia: [plazo de conservación].',
        ],
        counsel: 'Definir los plazos de conservación entre corchetes y confirmar el plazo de conservación fiscal.',
      },
      arco: {
        title: '8. Sus derechos ARCO',
        body: [
          'Usted puede Acceder a sus datos, Rectificarlos si son incorrectos, Cancelarlos (pedirnos que los eliminemos) y Oponerse a usos específicos. También puede revocar un consentimiento que nos haya otorgado.',
          'Para presentar una solicitud, escriba a {{email}} con su nombre completo, el correo electrónico de su cuenta, una copia de su identificación (o la de su representante, con el documento que acredite la representación) y una descripción clara de lo que solicita. Respondemos en un plazo de 20 días hábiles y, si su solicitud procede, la hacemos efectiva dentro de los 15 días hábiles siguientes.',
          'También puede descargar una copia de sus datos y solicitar usted directamente la eliminación de su cuenta en Perfil → Privacidad y datos.',
        ],
        counsel: 'Confirmar los plazos de respuesta y los requisitos conforme a la LFPDPPP vigente.',
      },
      storage: {
        title: '9. Almacenamiento del navegador',
        body: [
          'La versión web mantiene su sesión abierta y recuerda sus preferencias mediante el almacenamiento de su navegador. No usamos cookies publicitarias.',
        ],
        counsel: 'Confirmar con el equipo técnico la lista completa de cookies y tecnologías similares.',
      },
      security: {
        title: '10. Cómo los protegemos',
        body: [
          'Los datos viajan cifrados, el acceso se limita según el rol (por ejemplo, solo los revisores pueden ver los documentos de identidad) y cada carga de documentos y cada decisión de verificación quedan registradas.',
        ],
      },
      changes: {
        title: '11. Cambios a este aviso',
        body: [
          'Si modificamos este aviso, publicaremos la nueva versión aquí y se lo informaremos en la aplicación antes de que entren en vigor los cambios importantes.',
        ],
      },
      complaints: {
        title: '12. Si tiene una queja',
        body: [
          'Escríbanos primero a {{email}}. Si considera que no se han respetado sus derechos, puede acudir a la autoridad federal mexicana responsable de la protección de datos personales.',
        ],
        counsel: 'Indicar la autoridad competente y sus datos de contacto tras la reforma de 2025 a la LFPDPPP.',
      },
    },
  },
  biometric: {
    fingerprint: 'Huella digital',
    faceId: 'Face ID',
    iris: 'Iris',
    generic: 'Biometría',
    authenticate: 'Verifique su identidad para continuar',
    usePasscode: 'Usar código',
    enableLogin: 'Activar el acceso biométrico',
    enableAuth: 'Activar la autenticación biométrica',
  },
};

export default account;
