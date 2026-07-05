// Pakistan ke tamam education boards ki directory.
// `supported` server pe adapter maujood hone se decide hota hai (server.js dekhein).
// resultUrl = board ka official result-check page (fallback link).

const BOARDS = [
  // ---------- Federal ----------
  {
    id: 'fbise',
    name: 'Federal Board (FBISE), Islamabad',
    province: 'Federal',
    website: 'https://www.fbise.edu.pk/',
    resultUrl: 'https://result.fbise.edu.pk/',
  },

  // ---------- Khyber Pakhtunkhwa ----------
  {
    id: 'bisep',
    name: 'BISE Peshawar',
    province: 'Khyber Pakhtunkhwa',
    website: 'https://www.bisep.edu.pk/',
    resultUrl: 'https://cloud.bisep.edu.pk/',
  },
  {
    id: 'bisemdn',
    name: 'BISE Mardan',
    province: 'Khyber Pakhtunkhwa',
    website: 'https://www.bisemdn.edu.pk/',
    resultUrl: 'https://result.bisemdn.edu.pk/',
  },
  {
    id: 'bisekt',
    name: 'BISE Kohat',
    province: 'Khyber Pakhtunkhwa',
    website: 'https://bisekt.edu.pk/',
    resultUrl: 'https://bisekt.edu.pk/current_result/',
    note: 'This board shows a captcha — type the code from the image below.',
  },
  {
    id: 'biseswat',
    name: 'BISE Swat',
    province: 'Khyber Pakhtunkhwa',
    website: 'https://www.biseswat.edu.pk/',
    resultUrl: 'https://www.biseswat.edu.pk/results.html',
  },
  {
    id: 'biseat',
    name: 'BISE Abbottabad',
    province: 'Khyber Pakhtunkhwa',
    website: 'https://www.biseatd.edu.pk/',
    resultUrl: 'https://www.biseatd.edu.pk/',
  },
  {
    id: 'bisebannu',
    name: 'BISE Bannu',
    province: 'Khyber Pakhtunkhwa',
    website: 'https://www.bisebannu.edu.pk/',
    resultUrl: 'https://www.bisebannu.edu.pk/',
  },
  {
    id: 'bisedik',
    name: 'BISE D.I. Khan',
    province: 'Khyber Pakhtunkhwa',
    website: 'https://bisedik.edu.pk/',
    resultUrl: 'https://bisedik.edu.pk/results/current_result',
  },
  {
    id: 'bisemalakand',
    name: 'BISE Malakand',
    province: 'Khyber Pakhtunkhwa',
    website: 'https://bisemalakand.edu.pk/',
    resultUrl: 'https://bisemalakand.edu.pk/result',
  },

  // ---------- Punjab ----------
  {
    id: 'biselahore',
    name: 'BISE Lahore',
    province: 'Punjab',
    website: 'https://www.biselahore.com/',
    resultUrl: 'http://result.biselahore.com/',
    note: 'This board shows a captcha — type the code from the image below.',
  },
  {
    id: 'biserwp',
    name: 'BISE Rawalpindi',
    province: 'Punjab',
    website: 'https://www.biserawalpindi.edu.pk/',
    resultUrl: 'https://www.biserawalpindi.edu.pk/',
  },
  {
    id: 'bisegrw',
    name: 'BISE Gujranwala',
    province: 'Punjab',
    website: 'https://www.bisegrw.edu.pk/',
    resultUrl: 'https://www.bisegrw.edu.pk/',
  },
  {
    id: 'bisefsd',
    name: 'BISE Faisalabad',
    province: 'Punjab',
    website: 'https://bisefsd.edu.pk/',
    resultUrl: 'https://bisefsd.edu.pk/MatricResults.aspx',
  },
  {
    id: 'bisemultan',
    name: 'BISE Multan',
    province: 'Punjab',
    website: 'https://www.bisemultan.edu.pk/',
    resultUrl: 'https://web.bisemultan.edu.pk/results-10/',
  },
  {
    id: 'bisesargodha',
    name: 'BISE Sargodha',
    province: 'Punjab',
    website: 'https://www.bisesargodha.edu.pk/',
    resultUrl: 'https://www.bisesargodha.edu.pk/',
  },
  {
    id: 'bisebwp',
    name: 'BISE Bahawalpur',
    province: 'Punjab',
    website: 'https://www.bisebwp.edu.pk/',
    resultUrl: 'https://www.bisebwp.edu.pk/',
  },
  {
    id: 'bisedgkhan',
    name: 'BISE D.G. Khan',
    province: 'Punjab',
    website: 'http://www.bisedgkhan.edu.pk/',
    resultUrl: 'http://www.bisedgkhan.edu.pk/',
  },
  {
    id: 'bisesahiwal',
    name: 'BISE Sahiwal',
    province: 'Punjab',
    website: 'https://www.bisesahiwal.edu.pk/',
    resultUrl: 'https://www.bisesahiwal.edu.pk/allresult/',
  },

  // ---------- Sindh ----------
  {
    id: 'bsek',
    name: 'BSE Karachi (Matric)',
    province: 'Sindh',
    website: 'https://www.bsek.edu.pk/',
    resultUrl: 'https://www.bsek.edu.pk/',
  },
  {
    id: 'biek',
    name: 'BIE Karachi (Inter)',
    province: 'Sindh',
    website: 'https://biek.edu.pk/',
    resultUrl: 'https://biek.edu.pk/',
  },
  {
    id: 'bisehyd',
    name: 'BISE Hyderabad',
    province: 'Sindh',
    website: 'https://www.bisehyd.edu.pk/',
    resultUrl: 'https://www.bisehyd.edu.pk/',
  },
  {
    id: 'bisesukkur',
    name: 'BISE Sukkur',
    province: 'Sindh',
    website: 'https://www.bisesuk.edu.pk/',
    resultUrl: 'https://www.bisesuk.edu.pk/',
  },
  {
    id: 'biselarkana',
    name: 'BISE Larkana',
    province: 'Sindh',
    website: 'https://www.biselrk.edu.pk/',
    resultUrl: 'https://www.biselrk.edu.pk/',
  },
  {
    id: 'bisemirpurkhas',
    name: 'BISE Mirpurkhas',
    province: 'Sindh',
    website: 'https://www.bisemirpurkhas.edu.pk/',
    resultUrl: 'https://www.bisemirpurkhas.edu.pk/',
  },

  // ---------- Balochistan ----------
  {
    id: 'bbiseqta',
    name: 'BBISE Quetta',
    province: 'Balochistan',
    website: 'https://www.bbiseqta.edu.pk/',
    resultUrl: 'https://www.bbiseqta.edu.pk/',
  },

  // ---------- AJK / GB ----------
  {
    id: 'ajkbise',
    name: 'BISE AJK (Mirpur)',
    province: 'Azad Jammu & Kashmir',
    website: 'https://www.ajkbise.net/',
    resultUrl: 'https://www.ajkbise.net/',
  },
  {
    id: 'kiugb',
    name: 'BISE Gilgit-Baltistan',
    province: 'Gilgit-Baltistan',
    website: 'https://www.gbbise.edu.pk/',
    resultUrl: 'https://www.gbbise.edu.pk/',
  },
];

module.exports = { BOARDS };
