
const users = [
  {
    id: '410544b2-4001-4271-9855-fec4b6a6442a',
    name: 'Zebra Admin',
    email: 'infodanforth@zebrarobotics.com',
    password: 'Z3bDanf0rth!',
  },
];

const customers= [
  {"id":"2c082a65-bee3-4cb0-8961-11cc78d2d501","name":"bahira abdulsalam","email":"bahiraa@gmail.com"},
  {"id":"420531ee-096b-4edb-9b13-8cc78cad1224","name":"margot darling","email":""},
  {"id":"535f363b-a584-4c35-83b5-2d6f397e6db5","name":"cynthia dahl","email":""},
  {"id":"5cb66d80-0a51-4b8e-be65-70c523da9bff","name":"michael benvenuti","email":""},
  {"id":"7a5fc24f-fc28-47c3-86c5-9a107d6a79df","name":"cherry tan","email":""},
  {"id":"8728c04c-4b07-41e3-a52d-42b035aef033","name":"nicole winstanley","email":""},
  {"id":"930f6d71-9e7b-4a41-9601-d989c57a4e10","name":"suzy smith","email":""},
  {"id":"e999848f-3d5a-483a-9776-0a2e7fbd02b4","name":"andre kuzin","email":""}
]

const payments = [
  {
    customer_id: customers[0].id,
    amount: 15795,
    status: 'scheduled',
    date: '2022-12-06',
  },
  {
    customer_id: customers[1].id,
    amount: 20348,
    status: 'scheduled',
    date: '2022-11-14',
  },
  {
    customer_id: customers[4].id,
    amount: 3040,
    status: 'submitted',
    date: '2022-10-29',
  },
  {
    customer_id: customers[3].id,
    amount: 44800,
    status: 'submitted',
    date: '2023-09-10',
  },
  {
    customer_id: customers[5].id,
    amount: 34577,
    status: 'scheduled',
    date: '2023-08-05',
  },
  {
    customer_id: customers[2].id,
    amount: 54246,
    status: 'scheduled',
    date: '2023-07-16',
  },
  {
    customer_id: customers[0].id,
    amount: 666,
    status: 'scheduled',
    date: '2023-06-27',
  },
  {
    customer_id: customers[3].id,
    amount: 32545,
    status: 'submitted',
    date: '2023-06-09',
  },
  {
    customer_id: customers[4].id,
    amount: 1250,
    status: 'submitted',
    date: '2023-06-17',
  },
  {
    customer_id: customers[5].id,
    amount: 8546,
    status: 'submitted',
    date: '2023-06-07',
  },
  {
    customer_id: customers[1].id,
    amount: 500,
    status: 'submitted',
    date: '2023-08-19',
  },
  {
    customer_id: customers[5].id,
    amount: 8945,
    status: 'submitted',
    date: '2023-06-03',
  },
  {
    customer_id: customers[2].id,
    amount: 1000,
    status: 'submitted',
    date: '2022-06-05',
  },
];

const invoices = [
  {
    customer_id: customers[0].id,
    amount: 15795,
    
    date: '2022-12-06',
  },
  {
    customer_id: customers[1].id,
    amount: 20348,
   
    date: '2022-11-14',
  },
  {
    customer_id: customers[4].id,
    amount: 3040,
   
    date: '2022-10-29',
  },
  {
    customer_id: customers[3].id,
    amount: 44800,
    
    date: '2023-09-10',
  },
  {
    customer_id: customers[5].id,
    amount: 34577,
    
    date: '2023-08-05',
  },
  {
    customer_id: customers[2].id,
    amount: 54246,
    
    date: '2023-07-16',
  },
  {
    customer_id: customers[0].id,
    amount: 666,
    
    date: '2023-06-27',
  },
  {
    customer_id: customers[3].id,
    amount: 32545,
    
    date: '2023-06-09',
  },
  {
    customer_id: customers[4].id,
    amount: 1250,
    
    date: '2023-06-17',
  },
  {
    customer_id: customers[5].id,
    amount: 8546,
    
    date: '2023-06-07',
  },
  {
    customer_id: customers[1].id,
    amount: 500,
    
    date: '2023-08-19',
  },
  {
    customer_id: customers[5].id,
    amount: 8945,
    
    date: '2023-06-03',
  },
  {
    customer_id: customers[2].id,
    amount: 1000,
    
    date: '2022-06-05',
  },
];

const students = [{"idx":0,"id":1,"student_id":19369,"first_name":"Desta","last_name":"Mengesha-bailey","lms_password":""},{"idx":1,"id":2,"student_id":10779,"first_name":"Huey","last_name":"Allen","lms_password":"huey1234"},{"idx":2,"id":3,"student_id":19547,"first_name":"Jacob","last_name":"Alexander","lms_password":null},{"idx":3,"id":4,"student_id":20693,"first_name":"Sebastian","last_name":"Yiu","lms_password":"sebastian"},{"idx":4,"id":5,"student_id":7994,"first_name":"Jackson","last_name":"Pollard","lms_password":"jackson123"},{"idx":5,"id":6,"student_id":15741,"first_name":"Oskar","last_name":"Somermaa","lms_password":null},{"idx":6,"id":7,"student_id":19023,"first_name":"Gabriel","last_name":"Chmielewski Gallego","lms_password":""},{"idx":7,"id":8,"student_id":19546,"first_name":"Josh","last_name":"Alexander","lms_password":"None"},{"idx":8,"id":9,"student_id":9193,"first_name":"Elena","last_name":"Tsatsakis","lms_password":"elena123"},{"idx":9,"id":10,"student_id":10270,"first_name":"Aila","last_name":"Benvenuti","lms_password":"aila1234"},{"idx":10,"id":11,"student_id":20444,"first_name":"Nikita","last_name":"Sirohi","lms_password":null},{"idx":11,"id":12,"student_id":20692,"first_name":"Marcus","last_name":"Yiu","lms_password":null},{"idx":12,"id":13,"student_id":13493,"first_name":"Simon","last_name":"Darling","lms_password":"simon123"},{"idx":13,"id":14,"student_id":16702,"first_name":"Mary","last_name":"Zelasko-Wright","lms_password":null},{"idx":14,"id":15,"student_id":19776,"first_name":"Sienna","last_name":"Kaspiris","lms_password":null},{"idx":15,"id":16,"student_id":18745,"first_name":"William","last_name":"Bailey","lms_password":"None"},{"idx":16,"id":17,"student_id":9415,"first_name":"Tyler","last_name":"Sewerniuk","lms_password":"tyler123"},{"idx":17,"id":18,"student_id":19379,"first_name":"Tenzing","last_name":"Desal Amji","lms_password":null},{"idx":18,"id":19,"student_id":22149,"first_name":"Reese","last_name":"Silver","lms_password":"reese123"},{"idx":19,"id":20,"student_id":14754,"first_name":"Evan","last_name":"Schmelzer MacCharles","lms_password":null},{"idx":20,"id":21,"student_id":9327,"first_name":"Rudi","last_name":"Havelock","lms_password":null},{"idx":21,"id":22,"student_id":6937,"first_name":"Elizabeth","last_name":"Philip","lms_password":null},{"idx":22,"id":23,"student_id":13066,"first_name":"Ayaan","last_name":"Patel","lms_password":"ayaan123"},{"idx":23,"id":24,"student_id":19669,"first_name":"Wolf","last_name":"Christiansen","lms_password":null},{"idx":24,"id":25,"student_id":11136,"first_name":"Coan","last_name":"Dor","lms_password":"coan1234"},{"idx":25,"id":26,"student_id":12970,"first_name":"Yana","last_name":"Kira Jyothilingam","lms_password":"yana1234"},{"idx":26,"id":27,"student_id":15336,"first_name":"Adelise","last_name":"Howick","lms_password":"adelise123"},{"idx":27,"id":28,"student_id":19050,"first_name":"Sarisha","last_name":"Patil","lms_password":null},{"idx":28,"id":29,"student_id":19167,"first_name":"Penelope","last_name":"Meirovici","lms_password":null},{"idx":29,"id":30,"student_id":14402,"first_name":"Carl","last_name":"Navera-Slonim","lms_password":null},{"idx":30,"id":31,"student_id":19051,"first_name":"Ritvaan","last_name":"Patil","lms_password":null},{"idx":31,"id":32,"student_id":9657,"first_name":"Stephen","last_name":"Kuzin","lms_password":null},{"idx":32,"id":33,"student_id":20136,"first_name":"Mahd","last_name":"Adeel","lms_password":null},{"idx":33,"id":34,"student_id":8549,"first_name":"Kees","last_name":"Chaffey-Van Meggelen","lms_password":"kees1234"},{"idx":34,"id":35,"student_id":9690,"first_name":"Hannah","last_name":"Philip","lms_password":"hannah123"},{"idx":35,"id":36,"student_id":12638,"first_name":"Adam","last_name":"Chung","lms_password":"adam1234"},{"idx":36,"id":37,"student_id":19166,"first_name":"Wesley","last_name":"Meirovici","lms_password":null},{"idx":37,"id":38,"student_id":21554,"first_name":"Zoe","last_name":"Zarogiannis","lms_password":null},{"idx":38,"id":39,"student_id":10249,"first_name":"Declan","last_name":"Wong","lms_password":"None"},{"idx":39,"id":40,"student_id":11688,"first_name":"Zubin","last_name":"Robertson","lms_password":"zubin123"},{"idx":40,"id":41,"student_id":14893,"first_name":"Lochlan","last_name":"Brewer","lms_password":null},{"idx":41,"id":42,"student_id":18530,"first_name":"Adeline","last_name":"(Addie) Evenson","lms_password":"addie123"},{"idx":42,"id":43,"student_id":18531,"first_name":"Rowan","last_name":"Evenson","lms_password":null},{"idx":43,"id":44,"student_id":18807,"first_name":"Georgia","last_name":"Bell","lms_password":null},{"idx":44,"id":45,"student_id":19197,"first_name":"Julian","last_name":"Fallis","lms_password":"julian123"},{"idx":45,"id":46,"student_id":20655,"first_name":"Cardin","last_name":"Gerrard","lms_password":null},{"idx":46,"id":47,"student_id":14580,"first_name":"Tyler","last_name":"Brown","lms_password":null},{"idx":47,"id":48,"student_id":7482,"first_name":"Damon","last_name":"Fedy","lms_password":"None"},{"idx":48,"id":49,"student_id":8545,"first_name":"Orson","last_name":"Tearne","lms_password":"None"},{"idx":49,"id":50,"student_id":9710,"first_name":"Rowan","last_name":"Shaskin","lms_password":null},{"idx":50,"id":51,"student_id":17326,"first_name":"Owen","last_name":"Macdonald","lms_password":null},{"idx":51,"id":52,"student_id":17882,"first_name":"York","last_name":"Barrington","lms_password":null},{"idx":52,"id":53,"student_id":18323,"first_name":"Jack","last_name":"Barbisan","lms_password":null},{"idx":53,"id":54,"student_id":18765,"first_name":"Tyler","last_name":"Donleavy","lms_password":null},{"idx":54,"id":55,"student_id":10877,"first_name":"Alp","last_name":"Karaaslan","lms_password":null},{"idx":55,"id":56,"student_id":11689,"first_name":"Uma","last_name":"Robertson","lms_password":"uma12345"},{"idx":56,"id":57,"student_id":17886,"first_name":"Cedric","last_name":"Carlson","lms_password":null},{"idx":57,"id":58,"student_id":19095,"first_name":"Theodore","last_name":"Mack","lms_password":"theo1234"},{"idx":58,"id":59,"student_id":21357,"first_name":"Oliver","last_name":"Lewin","lms_password":null},{"idx":59,"id":60,"student_id":15738,"first_name":"Logan","last_name":"Chen","lms_password":null},{"idx":60,"id":61,"student_id":18174,"first_name":"Adrian","last_name":"Mastoras","lms_password":null},{"idx":61,"id":62,"student_id":18734,"first_name":"Owen","last_name":"Smith","lms_password":null},{"idx":62,"id":63,"student_id":18804,"first_name":"Kai","last_name":"Dunsmuir","lms_password":null},{"idx":63,"id":64,"student_id":19651,"first_name":"Massimo","last_name":"Murle","lms_password":"None"},{"idx":64,"id":65,"student_id":19654,"first_name":"Calvin","last_name":"Pathare","lms_password":"calvin123"},{"idx":65,"id":66,"student_id":19894,"first_name":"Callum","last_name":"Phillips","lms_password":null},{"idx":66,"id":67,"student_id":19895,"first_name":"Alasdair","last_name":"Phillips","lms_password":null},{"idx":67,"id":68,"student_id":19987,"first_name":"Killian","last_name":"Keddie","lms_password":null},{"idx":68,"id":69,"student_id":20021,"first_name":"Ethan","last_name":"Martin","lms_password":null},{"idx":69,"id":70,"student_id":20022,"first_name":"Maya","last_name":"Martin","lms_password":null},{"idx":70,"id":71,"student_id":20411,"first_name":"Leo","last_name":"Guerreiro Viegas","lms_password":"leo12345"},{"idx":71,"id":72,"student_id":21677,"first_name":"Josh","last_name":"Bisset","lms_password":null},{"idx":72,"id":73,"student_id":21968,"first_name":"Luca","last_name":"Mastoras","lms_password":null},{"idx":73,"id":74,"student_id":9188,"first_name":"Simon","last_name":"Meyers","lms_password":"simon123"},{"idx":74,"id":75,"student_id":18561,"first_name":"Ben","last_name":"Raymond","lms_password":"ben12345"},{"idx":75,"id":76,"student_id":9169,"first_name":"Jamie","last_name":"Besaw","lms_password":null},{"idx":76,"id":77,"student_id":13310,"first_name":"Dante","last_name":"Gee","lms_password":null},{"idx":77,"id":78,"student_id":14439,"first_name":"Shawn","last_name":"Wang","lms_password":"shawn123"},{"idx":78,"id":79,"student_id":10075,"first_name":"Emmett","last_name":"Floh","lms_password":"None"},{"idx":79,"id":80,"student_id":11640,"first_name":"Jacob","last_name":"Lee Poy","lms_password":"jacob123"},{"idx":80,"id":81,"student_id":14347,"first_name":"Carina","last_name":"Mastoras","lms_password":"carina123"},{"idx":81,"id":82,"student_id":15937,"first_name":"Mira","last_name":"Patel","lms_password":null},{"idx":82,"id":83,"student_id":16732,"first_name":"Ivri","last_name":"Ozery","lms_password":"ivri1234"},{"idx":83,"id":84,"student_id":17887,"first_name":"Wesley","last_name":"Carlson","lms_password":null},{"idx":84,"id":85,"student_id":18554,"first_name":"Omi","last_name":"Bascunan","lms_password":null},{"idx":85,"id":86,"student_id":18735,"first_name":"Nathan","last_name":"Shaskin","lms_password":null},{"idx":86,"id":87,"student_id":19934,"first_name":"Lila","last_name":"Sharma","lms_password":null},{"idx":87,"id":88,"student_id":20111,"first_name":"Julia","last_name":"Morrow","lms_password":null},{"idx":88,"id":89,"student_id":20989,"first_name":"Naleigha","last_name":"Wolski","lms_password":"None"},{"idx":89,"id":90,"student_id":20990,"first_name":"Zylphia","last_name":"Wolski","lms_password":null},{"idx":90,"id":91,"student_id":21676,"first_name":"Bridgette","last_name":"Bisset","lms_password":null},{"idx":91,"id":92,"student_id":8420,"first_name":"Nico","last_name":"Mastoras","lms_password":"nico1234"},{"idx":92,"id":93,"student_id":8422,"first_name":"Maya","last_name":"Trueman","lms_password":"maya1234"},{"idx":93,"id":94,"student_id":9189,"first_name":"Isaiah","last_name":"Meyers","lms_password":null},{"idx":94,"id":95,"student_id":21457,"first_name":"Abbad","last_name":"Nawaz","lms_password":null},{"idx":95,"id":96,"student_id":21675,"first_name":"James","last_name":"Bisset","lms_password":null},{"idx":96,"id":97,"student_id":9944,"first_name":"Chloe","last_name":"Papadatos","lms_password":"None"},{"idx":97,"id":98,"student_id":14081,"first_name":"Robbie","last_name":"Marshall","lms_password":"None"},{"idx":98,"id":99,"student_id":8971,"first_name":"Tula","last_name":"van Zon","lms_password":null},{"idx":99,"id":100,"student_id":6112,"first_name":"Sebastian","last_name":"Lam","lms_password":null}]
export {users, customers, payments, invoices, students};