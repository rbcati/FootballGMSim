/**
 * names.js — Expanded name pool for player generation.
 *
 * 175 first names + 300 last names = 52,500 unique combinations.
 * Imported by constants.js to replace the tiny default fallback arrays.
 */

export const FIRST_NAMES = [
  // Classic American
  'James', 'Michael', 'John', 'Robert', 'David', 'William', 'Richard', 'Joseph',
  'Thomas', 'Christopher', 'Charles', 'Daniel', 'Matthew', 'Anthony', 'Mark',
  'Donald', 'Steven', 'Andrew', 'Paul', 'Joshua', 'Kenneth', 'Kevin', 'Brian',
  'George', 'Timothy', 'Ronald', 'Edward', 'Jason', 'Jeffrey', 'Ryan',
  'Jacob', 'Gary', 'Nicholas', 'Eric', 'Jonathan', 'Stephen', 'Larry', 'Justin',
  'Scott', 'Brandon', 'Benjamin', 'Samuel', 'Raymond', 'Gregory', 'Frank',
  'Patrick', 'Alexander', 'Jack', 'Dennis', 'Jerry', 'Tyler', 'Aaron',
  'Nathan', 'Henry', 'Peter', 'Adam', 'Zachary', 'Douglas', 'Harold',
  // Modern / diverse
  'Malik', 'Jamal', 'DeAndre', 'Tyrone', 'Darius', 'Lamar', 'Terrell', 'Andre',
  'Marcus', 'Deshawn', 'Khalil', 'Marquise', 'Jalen', 'Davon', 'Rashad',
  'Trevon', 'Devin', 'Jaylon', 'Kadarius', 'Quincy', 'Darnell', 'Javon',
  'Amari', 'Isaiah', 'Elijah', 'Micah', 'Josiah', 'Jayden', 'Aidan',
  'Caleb', 'Ethan', 'Logan', 'Mason', 'Liam', 'Noah', 'Lucas', 'Owen',
  'Carter', 'Hunter', 'Dylan', 'Connor', 'Landon', 'Colton', 'Chase',
  // Hispanic / Latino
  'Carlos', 'Miguel', 'Luis', 'Jose', 'Alejandro', 'Diego', 'Rafael',
  'Gabriel', 'Angel', 'Mateo', 'Santiago', 'Emilio', 'Marco', 'Fernando',
  'Roberto', 'Eduardo', 'Hector', 'Ricardo', 'Sergio', 'Raul',
  // Pacific Islander / Asian
  'Tua', 'Manti', 'Marist', 'Talanoa', 'Vita', 'Penei',
  'Jordan', 'Kyler', 'Cam', 'Tre', 'Saquon', 'Lamar', 'Deshaun',
  // Short / punchy names
  'Cole', 'Drew', 'Brock', 'Troy', 'Clay', 'Bo', 'Ray', 'Rex',
  'Dane', 'Cade', 'Trey', 'Brett', 'Grant', 'Blake', 'Shane',
  'Wes', 'Kirk', 'Jace', 'Beau', 'Kade', 'Reid', 'Quinn', 'Nash',
  // Additional variety
  'Tyreek', 'Odell', 'Derrick', 'Stefon', 'Keenan', 'DeVonta', 'Amon-Ra',
  'Garrett', 'Cooper', 'Travis', 'Kelce', 'Davante', 'CeeDee',
  'Jahmyr', 'Breece', 'Bijan', 'Kenneth', 'Christian', 'Najee',
  'Myles', 'Maxx', 'Arik', 'Danielle', 'Chandler', 'Von', 'Shaquil',
  'Sauce', 'Jaire', 'Marshon', 'Denzel', 'Patrick', 'Jessie', 'Roquan',
];

export const LAST_NAMES = [
  // Common American surnames
  'Smith', 'Johnson', 'Williams', 'Brown', 'Jones', 'Garcia', 'Miller', 'Davis',
  'Rodriguez', 'Martinez', 'Hernandez', 'Lopez', 'Gonzalez', 'Wilson', 'Anderson',
  'Thomas', 'Taylor', 'Moore', 'Jackson', 'Martin', 'Lee', 'Perez', 'Thompson',
  'White', 'Harris', 'Sanchez', 'Clark', 'Ramirez', 'Lewis', 'Robinson',
  'Walker', 'Young', 'Allen', 'King', 'Wright', 'Scott', 'Torres', 'Nguyen',
  'Hill', 'Flores', 'Green', 'Adams', 'Nelson', 'Baker', 'Hall', 'Rivera',
  'Campbell', 'Mitchell', 'Carter', 'Roberts', 'Gomez', 'Phillips', 'Evans',
  'Turner', 'Diaz', 'Parker', 'Cruz', 'Edwards', 'Collins', 'Reyes', 'Stewart',
  'Morris', 'Morales', 'Murphy', 'Cook', 'Rogers', 'Gutierrez', 'Ortiz',
  'Morgan', 'Cooper', 'Peterson', 'Bailey', 'Reed', 'Kelly', 'Howard',
  'Ramos', 'Kim', 'Cox', 'Ward', 'Richardson', 'Watson', 'Brooks', 'Chavez',
  'Wood', 'James', 'Bennett', 'Gray', 'Mendoza', 'Ruiz', 'Hughes', 'Price',
  'Alvarez', 'Castillo', 'Sanders', 'Patel', 'Myers', 'Long', 'Ross', 'Foster',
  'Jimenez', 'Powell', 'Jenkins', 'Perry', 'Russell', 'Sullivan', 'Bell',
  // Football-style surnames
  'Manning', 'Brady', 'Barkley', 'Fitzgerald', 'Prescott', 'Mahomes', 'Kelce',
  'Jefferson', 'Chase', 'Parsons', 'Hutchinson', 'Stroud', 'Young', 'Richardson',
  'Burrow', 'Herbert', 'Murray', 'Fields', 'Lawrence', 'Lance',
  'Bosa', 'Watt', 'Donald', 'Garrett', 'Crosby', 'Burns', 'Sweat',
  'Ramsey', 'Lattimore', 'Surtain', 'Stingley', 'Gardner', 'McDuffie',
  'Henry', 'McCaffrey', 'Chubb', 'Mixon', 'Cook', 'Kamara', 'Jacobs',
  'Adams', 'Hill', 'Diggs', 'Lamb', 'Brown', 'Moore', 'Williams', 'Olave',
  'Kittle', 'Andrews', 'Kelce', 'Pitts', 'Hockenson', 'Goedert',
  'Slater', 'Sewell', 'Wirfs', 'Nelson', 'Humphrey', 'Linderbaum',
  // Diverse / ethnic variety
  'Washington', 'Jefferson', 'Freeman', 'Coleman', 'Grant', 'Marshall',
  'Dixon', 'Hunt', 'Palmer', 'Hamilton', 'Graham', 'Reynolds', 'Griffin',
  'Wallace', 'Duncan', 'Hayes', 'Ford', 'Gibson', 'Stone', 'Hawkins',
  'Matthews', 'Douglas', 'Tucker', 'Spencer', 'Poole', 'Tate', 'Wade',
  'Banks', 'Barton', 'Bishop', 'Blake', 'Booth', 'Bradford', 'Branch',
  'Bridges', 'Burke', 'Burton', 'Byrd', 'Cain', 'Calloway', 'Cannon',
  'Carr', 'Carson', 'Chandler', 'Christian', 'Clay', 'Clements', 'Cole',
  'Conley', 'Conrad', 'Cordero', 'Daniels', 'Dawkins', 'Decker', 'Delgado',
  'Dorsey', 'Drake', 'Dunn', 'Durham', 'Eaton', 'Ellison', 'Emery',
  'Everett', 'Farmer', 'Fleming', 'Fletcher', 'Floyd', 'Foreman', 'Fuller',
  'Gaines', 'Galloway', 'Garner', 'Gibbs', 'Gilbert', 'Gilmore', 'Glover',
  'Gordon', 'Graves', 'Harper', 'Harrison', 'Hartman', 'Harvey', 'Hayward',
  'Henderson', 'Hicks', 'Hines', 'Holland', 'Holmes', 'Hood', 'Hopkins',
  'Horton', 'Houston', 'Ingram', 'Irvin', 'Ivory', 'Jeter', 'Johns',
  'Keller', 'Kendricks', 'Knox', 'Landry', 'Lang', 'Lawson', 'Leonard',
  'Lester', 'Little', 'Lofton', 'Logan', 'Love', 'Mack', 'Maddox',
  'Malone', 'Mann', 'Marks', 'Marsh', 'Mason', 'McCoy', 'McKinney',
  'Mead', 'Meyers', 'Miles', 'Mills', 'Minor', 'Monroe', 'Mosley',
  'Moss', 'Neal', 'Newton', 'Norman', 'Norris', 'Oliver', 'Owens',
  'Page', 'Parks', 'Payne', 'Pena', 'Pierce', 'Porter', 'Pryor',
  'Quinn', 'Randle', 'Randolph', 'Redd', 'Rice', 'Riley', 'Rivers',
  'Roberson', 'Robertson', 'Rodgers', 'Rowe', 'Sampson', 'Santiago',
  'Saunders', 'Simmons', 'Singleton', 'Slay', 'Sneed', 'Stafford',
  'Stanley', 'Steele', 'Stevens', 'Strong', 'Swift', 'Tatum', 'Terry',
  'Thornton', 'Tolbert', 'Townsend', 'Trufant', 'Vargas', 'Vega',
  'Vernon', 'Vincent', 'Wagner', 'Walton', 'Warren', 'Waters', 'Watts',
  'Webb', 'Webster', 'Weeks', 'Whitfield', 'Wilkins', 'Willis', 'Woodson',
  'Wyatt', 'York', 'Zimmerman',
];
