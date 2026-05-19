/**
 * Diccionarios extendidos de fármacos y enfermedades veterinarias.
 *
 * SOLO se usan para:
 *  1) Fuzzy match contra typos (sugerir "azitromicina" si tipean "azitromisina"
 *     aun cuando el fármaco no esté en el catálogo principal)
 *  2) Validar que el término es plausible antes de llamar a la IA
 *
 * NO se usan para mostrar información — todos los datos clínicos vienen del
 * catálogo principal (cuando aplica) o de la IA (consulta dinámica).
 *
 * Mantener nombres oficiales en español (DCI cuando exista).
 */

export const EXTENDED_DRUG_NAMES = [
  // ── Antibióticos β-lactámicos
  'Amoxicilina', 'Ampicilina', 'Penicilina', 'Bencilpenicilina', 'Cloxacilina',
  'Dicloxacilina', 'Oxacilina', 'Cefalexina', 'Cefadroxilo', 'Cefazolina',
  'Cefovecina', 'Cefpodoxima', 'Ceftiofur', 'Cefquinoma', 'Ceftriaxona',
  'Cefotaxima', 'Cefepima', 'Cefoperazona',
  // ── Quinolonas
  'Enrofloxacina', 'Marbofloxacina', 'Ciprofloxacina', 'Pradofloxacina',
  'Difloxacina', 'Orbifloxacina', 'Norfloxacina', 'Levofloxacina',
  // ── Tetraciclinas
  'Doxiciclina', 'Oxitetraciclina', 'Tetraciclina', 'Minociclina', 'Clortetraciclina',
  // ── Macrólidos
  'Eritromicina', 'Azitromicina', 'Claritromicina', 'Tilosina', 'Tilmicosina',
  'Tulatromicina', 'Gamitromicina', 'Tildipirosina',
  // ── Lincosamidas
  'Lincomicina', 'Clindamicina', 'Pirlimicina',
  // ── Aminoglucósidos
  'Gentamicina', 'Estreptomicina', 'Neomicina', 'Amikacina', 'Tobramicina', 'Apramicina',
  // ── Otros antibióticos
  'Florfenicol', 'Cloranfenicol', 'Tianfenicol', 'Sulfametoxazol', 'Trimetoprim',
  'Sulfadiazina', 'Sulfaquinoxalina', 'Sulfadimetoxina', 'Metronidazol',
  'Nitrofurantoína', 'Furazolidona', 'Vancomicina', 'Imipenem', 'Meropenem',
  'Polimixina', 'Bacitracina', 'Tiamulina', 'Valnemulina', 'Rifampicina',
  'Linezolid', 'Tinidazol',

  // ── AINEs y analgésicos
  'Meloxicam', 'Carprofeno', 'Firocoxib', 'Robenacoxib', 'Deracoxib', 'Mavacoxib',
  'Cimicoxib', 'Tepoxalin', 'Grapiprant', 'Ketoprofeno', 'Tolfenámico', 'Vedaprofeno',
  'Aspirina', 'Ibuprofeno', 'Paracetamol', 'Acetaminofén', 'Dipirona', 'Metamizol',
  'Flunixin', 'Flunixina', 'Fenilbutazona', 'Diclofenaco', 'Naproxeno', 'Piroxicam',
  'Ketorolaco',

  // ── Antiparasitarios internos
  'Ivermectina', 'Doramectina', 'Selamectina', 'Moxidectina', 'Eprinomectina',
  'Abamectina', 'Milbemicina', 'Praziquantel', 'Pirantel', 'Febantel',
  'Mebendazol', 'Albendazol', 'Fenbendazol', 'Oxfendazol', 'Tiabendazol',
  'Flubendazol', 'Triclabendazol', 'Levamisol', 'Niclosamida', 'Epsiprantel',
  'Closantel', 'Nitazoxanida', 'Emodepside', 'Toltrazuril', 'Diclazuril',
  // ── Antiparasitarios externos
  'Fipronil', 'Imidacloprid', 'Permetrina', 'Deltametrina', 'Cipermetrina',
  'Amitraz', 'Lufenuron', 'Metopreno', 'Piriproxifen', 'Spinosad', 'Spinetoram',
  'Fluralaner', 'Afoxolaner', 'Sarolaner', 'Lotilaner', 'Esafoxolaner',
  'Indoxacarb', 'Dinotefuran', 'Pirimifos',

  // ── Antifúngicos
  'Ketoconazol', 'Itraconazol', 'Fluconazol', 'Posaconazol', 'Voriconazol',
  'Griseofulvina', 'Terbinafina', 'Anfotericina B', 'Nistatina', 'Clotrimazol',
  'Miconazol', 'Enilconazol', 'Natamicina',

  // ── Anestésicos y sedantes
  'Ketamina', 'Tiletamina', 'Xilacina', 'Medetomidina', 'Dexmedetomidina',
  'Romifidina', 'Detomidina', 'Acepromacina', 'Diazepam', 'Midazolam', 'Zolazepam',
  'Propofol', 'Alfaxalona', 'Tiopental', 'Pentobarbital', 'Etomidato',
  'Isoflurano', 'Sevoflurano', 'Desflurano', 'Halotano', 'Atropina', 'Glicopirrolato',
  'Lidocaína', 'Procaína', 'Bupivacaína', 'Mepivacaína', 'Tetracaína', 'Ropivacaína',

  // ── Opioides
  'Morfina', 'Buprenorfina', 'Tramadol', 'Butorfanol', 'Fentanilo', 'Sufentanilo',
  'Alfentanilo', 'Remifentanilo', 'Metadona', 'Oximorfona', 'Hidromorfona',
  'Codeína', 'Naloxona', 'Naltrexona', 'Nalbufina', 'Petidina',

  // ── Cardiovasculares y diuréticos
  'Furosemida', 'Espironolactona', 'Hidroclorotiazida', 'Pimobendan', 'Digoxina',
  'Enalapril', 'Benazepril', 'Captopril', 'Ramipril', 'Lisinopril', 'Diltiazem',
  'Amlodipino', 'Atenolol', 'Propranolol', 'Carvedilol', 'Sotalol', 'Sildenafil',
  'Mexiletina', 'Procainamida', 'Quinidina', 'Verapamilo', 'Telmisartan',
  'Losartan', 'Valsartan', 'Olmesartan', 'Hidralazina', 'Nitroglicerina',
  'Isosorbide', 'Clorotiazida', 'Torasemida',

  // ── Endocrinos
  'Insulina', 'Levotiroxina', 'Tiamazol', 'Carbimazol', 'Metimazol',
  'Prednisona', 'Prednisolona', 'Dexametasona', 'Triamcinolona', 'Hidrocortisona',
  'Betametasona', 'Metilprednisolona', 'Fludrocortisona', 'Trilostano', 'Mitotano',
  'Desoxicorticosterona', 'Desmopresina', 'Vasopresina', 'Oxitocina',
  'Gonadotropina', 'Gonadorelina', 'Cloprostenol', 'Dinoprost', 'Altrenogest',
  'Megestrol', 'Mibolerona', 'Estanozolol', 'Boldenona',

  // ── Gastrointestinales
  'Omeprazol', 'Pantoprazol', 'Esomeprazol', 'Lansoprazol', 'Famotidina',
  'Ranitidina', 'Cimetidina', 'Sucralfato', 'Maropitant', 'Metoclopramida',
  'Domperidona', 'Ondansetron', 'Granisetron', 'Cisaprida', 'Mosaprida',
  'Mirtazapina', 'Diosmectita', 'Loperamida', 'Lactulosa', 'Misoprostol',
  'Pancreatina',

  // ── Neurológicos / anticonvulsivantes
  'Fenobarbital', 'Bromuro de potasio', 'Levetiracetam', 'Zonisamida',
  'Gabapentina', 'Pregabalina', 'Topiramato', 'Imepitoína', 'Primidona',
  'Selegilina', 'Amantadina', 'Fluoxetina', 'Sertralina', 'Clomipramina',
  'Amitriptilina', 'Trazodona', 'Alprazolam',

  // ── Quimioterapia / inmunomoduladores
  'Vincristina', 'Vinblastina', 'Doxorrubicina', 'Ciclofosfamida', 'Clorambucilo',
  'Lomustina', 'Carboplatino', 'Cisplatino', 'Metotrexato', 'Citarabina',
  'L-asparaginasa', 'Toceranib', 'Masitinib', 'Hidroxiurea', 'Melfalan',
  'Ciclosporina', 'Tacrolimus', 'Azatioprina', 'Leflunomida', 'Oclacitinib',
  'Lokivetmab',

  // ── Otros / vitaminas / antídotos
  'Heparina', 'Enoxaparina', 'Warfarina', 'Clopidogrel', 'Vitamina K1', 'Fitomenadiona',
  'Vitamina B12', 'Cianocobalamina', 'Tiamina', 'Ácido fólico', 'Hierro dextrano',
  'Calcio gluconato', 'Magnesio sulfato', 'Mannitol', 'Manitol',
  'Epinefrina', 'Adrenalina', 'Norepinefrina', 'Dopamina', 'Dobutamina',
  'Efedrina', 'Etilefrina', 'Acetilcisteína', 'N-acetilcisteína',
  'Carbón activado', 'Pralidoxima', 'Flumazenil', 'Atipamezol', 'Yohimbina',
  'Tolazolina', 'Edrofonio', 'Neostigmina', 'Pirimetamina', 'Clorpromazina',
  'Difenhidramina', 'Cetirizina', 'Hidroxizina', 'Loratadina', 'Clorfeniramina',
  'Apomorfina', 'Yodo', 'Permanganato de potasio',
]

export const EXTENDED_DISEASE_NAMES = [
  // ── Virales caninas
  'Parvovirosis', 'Parvovirus canino', 'Distemper', 'Moquillo', 'Moquillo canino',
  'Hepatitis canina infecciosa', 'Adenovirus canino', 'Tos de las perreras',
  'Traqueobronquitis infecciosa', 'Coronavirus canino', 'Influenza canina',
  'Herpesvirus canino', 'Rabia',
  // ── Virales felinas
  'Panleucopenia felina', 'Calicivirus felino', 'Calicivirosis',
  'Rinotraqueitis viral felina', 'Herpesvirus felino', 'FIV',
  'Virus de inmunodeficiencia felina', 'FeLV', 'Leucemia felina',
  'PIF', 'FIP', 'Peritonitis infecciosa felina',
  // ── Virales otras especies
  'Enfermedad de Aujeszky', 'IBR', 'Rinotraqueitis infecciosa bovina',
  'Diarrea viral bovina', 'BVD', 'Fiebre aftosa', 'Lengua azul', 'Newcastle',
  'Influenza aviar', 'Gripe aviar', 'Enfermedad de Marek', 'Enfermedad de Gumboro',
  'Bronquitis infecciosa aviar', 'Anemia infecciosa equina', 'Influenza equina',
  'Encefalomielitis equina', 'PRRS', 'Fiebre porcina africana',
  'Fiebre porcina clásica', 'Circovirus porcino', 'Mixomatosis',
  'Enfermedad hemorrágica viral del conejo',

  // ── Bacterianas
  'Leptospirosis', 'Brucelosis', 'Borreliosis', 'Enfermedad de Lyme', 'Tuberculosis',
  'Mastitis', 'Endometritis', 'Piometra', 'Peritonitis', 'Pericarditis',
  'Pasteurelosis', 'Salmonelosis', 'Colibacilosis', 'Clostridiosis',
  'Tétanos', 'Botulismo', 'Ántrax', 'Carbunco bacteridiano',
  'Bordetelosis', 'Ehrlichiosis', 'Anaplasmosis', 'Bartonelosis',
  'Tularemia', 'Listeriosis', 'Estreptococosis', 'Estafilococosis',
  'Actinomicosis', 'Actinobacilosis', 'Riemerelosis',
  'Pioderma', 'Foliculitis', 'Forunculosis',

  // ── Parasitarias
  'Dirofilariasis', 'Gusano del corazón', 'Babesiosis', 'Piroplasmosis',
  'Hepatozoonosis', 'Toxoplasmosis', 'Neosporosis', 'Giardiasis', 'Coccidiosis',
  'Criptosporidiosis', 'Leishmaniasis', 'Leishmaniosis', 'Tripanosomiasis',
  'Sarna sarcóptica', 'Sarcoptosis', 'Sarna demodéctica', 'Demodicosis',
  'Otoacariosis', 'Otoacaríasis', 'Cheyletielosis', 'Tricomoniasis',
  'Ascariasis', 'Toxocariasis', 'Anquilostomiasis', 'Trichuriasis',
  'Strongiloidiasis', 'Fasciolasis', 'Distomatosis hepática',
  'Paramfistomosis', 'Schistosomiasis', 'Dipilidiosis',
  'Equinococosis', 'Hidatidosis', 'Teniasis', 'Cisticercosis',

  // ── Micóticas
  'Dermatofitosis', 'Tiña', 'Aspergilosis', 'Candidiasis', 'Criptococosis',
  'Histoplasmosis', 'Blastomicosis', 'Coccidioidomicosis', 'Esporotricosis',
  'Malasseziosis', 'Pitiriasis',

  // ── Endocrinas y metabólicas
  'Síndrome de Cushing', 'Hiperadrenocorticismo', 'Enfermedad de Addison',
  'Hipoadrenocorticismo', 'Diabetes mellitus', 'Diabetes insípida',
  'Cetoacidosis diabética', 'Hipoglucemia', 'Hiperglucemia', 'Hipotiroidismo',
  'Hipertiroidismo', 'Acromegalia', 'Hipocalcemia', 'Hipercalcemia', 'Eclampsia',
  'Fiebre de la leche', 'Hipomagnesemia', 'Tetania de los pastos',
  'Lipidosis hepática', 'Hiperlipidemia', 'Hipertrigliceridemia',

  // ── Renales / urinarias
  'Insuficiencia renal aguda', 'Insuficiencia renal crónica', 'Enfermedad renal crónica',
  'Glomerulonefritis', 'Pielonefritis', 'Cistitis', 'Urolitiasis',
  'Cálculos vesicales', 'FLUTD', 'Síndrome urológico felino',
  'Incontinencia urinaria',

  // ── Cardiacas
  'Insuficiencia cardiaca congestiva', 'Cardiomiopatía dilatada',
  'Cardiomiopatía hipertrófica', 'Estenosis aórtica', 'Estenosis pulmonar',
  'Persistencia del conducto arterioso', 'Endocardiosis', 'Endocarditis',
  'Tamponade cardíaco', 'Arritmia', 'Fibrilación auricular',
  'Bloqueo atrioventricular',

  // ── Neurológicas
  'Epilepsia', 'Epilepsia idiopática', 'Convulsiones', 'Estatus epiléptico',
  'Encefalitis', 'Meningitis', 'Mielitis', 'Hernia discal',
  'Enfermedad del disco intervertebral', 'Discoespondilitis', 'Síndrome vestibular',
  'Hidrocefalia', 'Meningoencefalitis granulomatosa', 'Síndrome de cauda equina',

  // ── Gastrointestinales
  'Gastritis', 'Gastroenteritis', 'Úlcera gástrica', 'Colitis', 'Enteritis',
  'Enfermedad inflamatoria intestinal', 'IBD', 'Megaesófago', 'Pancreatitis',
  'Insuficiencia pancreática exocrina', 'Dilatación vólvulo gástrico', 'GDV',
  'Síndrome de torsión gástrica', 'Hepatitis', 'Cirrosis', 'Colangitis',
  'Colangiohepatitis', 'Shunt portosistémico', 'Lipidosis hepática felina',

  // ── Respiratorias
  'Bronquitis', 'Bronquitis crónica', 'Neumonía', 'Asma felino',
  'Síndrome braquicefálico', 'Parálisis laríngea', 'Colapso traqueal',
  'Edema pulmonar', 'Tromboembolismo pulmonar', 'Atelectasia',
  'Pleuritis', 'Quilotórax', 'Pioneumotórax',

  // ── Dermatológicas
  'Dermatitis atópica', 'Dermatitis alérgica', 'Dermatitis alérgica por pulgas',
  'DAPP', 'Acantosis nigricans', 'Seborrea', 'Alopecia', 'Dermatitis húmeda',
  'Pioderma superficial', 'Pioderma profunda',

  // ── Oncológicas
  'Linfoma', 'Mastocitoma', 'Hemangiosarcoma', 'Osteosarcoma', 'Carcinoma',
  'Adenocarcinoma', 'Melanoma', 'Tumor venéreo transmisible', 'TVT',
  'Tumor mamario', 'Linfosarcoma',

  // ── Reproductivas y neonatales
  'Distocia', 'Retención placentaria', 'Prolapso uterino', 'Vaginitis',
  'Balanopostitis', 'Orquitis', 'Epididimitis', 'Hiperplasia prostática benigna',
  'Prostatitis', 'Criptorquidia', 'Pseudogestación', 'Galactostasis',
  'Síndrome de la cría desvanecida',

  // ── Oftalmológicas
  'Conjuntivitis', 'Queratitis', 'Queratoconjuntivitis seca', 'Ojo seco',
  'Uveítis', 'Cataratas', 'Glaucoma', 'Úlcera corneal',
  'Prolapso de la glándula del tercer párpado', 'Cherry eye',
  'Entropion', 'Ectropion', 'Atrofia progresiva de retina',
]

// ── Patrones farmacéuticos típicos (sufijos DCI) ────────────────────────────
// Alta precisión (pocos falsos positivos). Si un término termina en uno de
// estos sufijos asumimos que es un fármaco plausible aunque no esté en la lista.
export const DRUG_SUFFIX_PATTERNS = [
  /cilina$/i,    // penicilina, amoxicilina
  /micina$/i,    // eritromicina, gentamicina
  /ciclina$/i,   // tetraciclina, doxiciclina
  /floxacina$/i, // enrofloxacina, ciprofloxacina
  /sartán?$/i,   // losartan, valsartan
  /prazol$/i,    // omeprazol, pantoprazol
  /azol$/i,      // metronidazol, fluconazol, ketoconazol
  /caína$/i,     // lidocaína, bupivacaína
  /coxib$/i,     // firocoxib, robenacoxib
  /mectina$/i,   // ivermectina, doramectina
  /profeno$/i,   // carprofeno, ibuprofeno, ketoprofeno
  /trexato$/i,   // metotrexato
  /etina$/i,     // fluoxetina, paroxetina
  /azepam$/i,    // diazepam, lorazepam
  /dipino$/i,    // amlodipino, nifedipino
  /estatina$/i,  // atorvastatina, simvastatina
  /tiazida$/i,   // hidroclorotiazida
  /barbital$/i,  // fenobarbital, pentobarbital
  /pamida$/i,    // ciclofosfamida
  /azepina$/i,   // carbamazepina
  /olol$/i,      // atenolol, propranolol
  /sona$/i,      // prednisona, dexametasona (cuidado: nombre propio, pero suficientemente específico)
  /solona$/i,    // prednisolona, metilprednisolona
  /pril$/i,      // enalapril, captopril, benazepril
]

// ── Patrones de enfermedades (sufijos médicos) ──────────────────────────────
export const DISEASE_SUFFIX_PATTERNS = [
  /itis$/i,      // mastitis, peritonitis, hepatitis
  /osis$/i,      // parvovirosis, leptospirosis, demodicosis
  /iasis$/i,     // giardiasis, fasciolasis, hidatidosis
  /emia$/i,      // leucemia, hipoglucemia, septicemia
  /uria$/i,      // hematuria, glucosuria
  /algia$/i,     // mialgia, artralgia
  /patía$/i,     // cardiopatía, nefropatía
  /plasia$/i,    // displasia, hiperplasia, aplasia
  /trofia$/i,    // atrofia, distrofia, hipertrofia
  /ectomía$/i,   // ovariohisterectomía
  /paresia$/i,   // hemiparesia
  /plejía$/i,    // hemiplejía
  /sarcoma$/i,   // osteosarcoma, hemangiosarcoma, linfosarcoma
  /carcinoma$/i, // adenocarcinoma
  /linfoma$/i,
]
