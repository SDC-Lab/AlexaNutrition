/* taken from http://www.nutritionaustralia.org/national/resource/australian-dietary-guidelines-recommended-daily-intakes */
INSERT INTO favorites.RecommendedDailyIntake (age_group, gender, vegetables, fruit, grains, meat, dairy, other)
VALUES
		('girls 1-2 years', 'female', 'two to three', 'half', 'four', 'one', 'one to one and a half', 'none'),
		('boys 1-2 years', 'male', 'two to three', 'half', 'four', 'one', 'one to one and a half', 'none'),

		('girls 2-3 years', 'female', 'two and a half','one', 'four', 'one', 'one and a half', 'zero to one'),
		('boys 2-3 years', 'male', 'two and a half','one', 'four', 'one', 'one and a half', 'zero to one'),

		('girls 4-8 years', 'female', 'four and a half','one and a half','four','one and a half','one and a half', 'zero to one'),
		('boys 4-8 years', 'male', 'four and a half','one and a half','four','one and a half','two', 'zero to two and a half'),

		('girls 9-11 years', 'female', 'five','two','four','two and a half','three', 'zero to three'),
		('boys 9-11 years', 'male', 'five','two','five','two and a half','two and a half', 'zero to three'),

		('girls 12-13 years', 'female','five','two','five','two and a half','three and a half', 'zero to two and a half'),
		('boys 12-13 years', 'male', 'five and a half','two','six','two and a half','three and a half', 'zero to three'),

		('girls 14-18 years', 'female', 'five','two','seven','two and a half','three and a half', 'zero to two and a half'),
		('boys 14-18 years', 'male', 'five and a half','two','seven','two and a half','three and a half', 'zero to five'),

		('women 19-50 years', 'female', 'five','two','six','two and a half','two and a half', 'zero to two and a half'),
		('men 19-50 years', 'male', 'five and a half','two','six','two and a half','two and a half', 'zero to three'),
        
    ('women 51-70 years', 'female', 'five','two','four','two','four', 'zero to two and half'),
    ('men 51-70 years', 'male', 'five and a half','two','six','two and a half','two and a half', 'zero to two and a half'),
        
    ('women 70+ years', 'female', 'five','two','three','two','four', 'zero to two and a half'),
    ('men 70+ years', 'male', 'five','two','four and a half','two and a half','three and a half', 'zero to two and a half');

INSERT INTO favorites.AgeGroup (age_group, lower_limit, upper_limit, group_label)
VALUES	
		('girls 1-2 years', 1, 1, 'toddlers'),
		('boys 1-2 years', 1, 1, 'toddlers'),
		('girls 2-3 years', 2, 3, 'toddlers'),
		('boys 2-3 years', 2, 3, 'toddlers'),

		('girls 4-8 years', 4, 8, 'children'),
		('boys 4-8 years', 4, 8, 'children'),
		('girls 9-11 years', 9, 11, 'children'),
		('boys 9-11 years', 9, 11, 'children'),

		('girls 12-13 years', 12, 13, 'adolescents'),
		('boys 12-13 years', 12, 13, 'adolescents'),
		('girls 14-18 years', 14, 18, 'adolescents'),
		('boys 14-18 years', 14, 18, 'adolescents'),

		('women 19-50 years', 19, 50, 'adults'),
		('men 19-50 years', 19, 50, 'adults'),
    ('women 51-70 years', 51, 70, 'adults'),
    ('men 51-70 years', 51, 70, 'adults'),
        
    ('women 70+ years', 71, 125, 'older adults'),
    ('men 70+ years', 71, 125, 'older adults');

/* taken from https://www.livescience.com https://makingsenseofsugar.com/all-about-sugar/what-is-sugar */
INSERT INTO favorites.NutrientInformation (name, description, sources)
VALUES 
		(
			'protein', 
			'Protein is a macro nutrient that is essential to building muscle mass',
			'Protein is commonly found in animal products, though is also present in other sources, such as nuts and legumes'
		),
		(
			'carbohydrate',
			'Carbohydrates are the sugars, starches and fibers found in fruits, grains, vegetables and milk products',
			'Carbohydrates are found in breads, fruits and vegetables, as well as milk products'
		),
		(
			'sugar',
			'Sugars are carbohydrates that provide energy for the body, The body breaks down all sugars and starches to glucose',
			'Sugars occur naturally in a wide variety of fruits, vegetables, and dairy foods. They can also be produced commercially and added to foods to heighten sweetness and for the many technical functions they perform'
		),
		(
			'fat',
			'fat is an important nutrient that primarily functions as an energy reserve. It has 9 calories per gram, twice that of carbohydrates and protein',
			'Some foods, including most fruits and vegetables, have almost no fat. Other foods have plenty of fat. They include nuts, oils, butter, and meats like beef'
		),
		(
			'calories',
			'Calories in food provide energy in the form of heat so that our bodies can function. Our bodies store and burn calories as fuel',
			'All foods provide calories as it is a general measurement of energy'
		),
		(
			'fiber',
			'Dietary fiber is a plant-based nutrient that is sometimes called roughage or bulk. It is a type of carbohydrate but, unlike other carbs, it cannot be broken down into digestible sugar molecules. Therefore, fiber passes through the intestinal tract relatively intact',
			'fiber is found in oat bran, barley, nuts, seeds, beans, lentils, peas, and some fruits and vegetables. It is also found in psyllium, a common fiber supplement'
		),
		(
			'sodium',
			'Sodium is a mineral that occurs naturally in foods or is added during manufacturing - or both. Naturally occurring sodium is in foods such as celery, beets and milk',
			'Sodium is found in most foods, high sodium foods include smoked, cured, salted or canned meat, fish or poultry including bacon, cold cuts, ham, frankfurters, sausage, sardines, caviar and anchovies. Frozen breaded meats and dinners, such as burritos and pizza'
		),
		(
			'saturated fat',
			'saturated fats are simply fat molecules that have no double bonds between carbon molecules because they are saturated with hydrogen molecules. Saturated fats are typically solid at room temperature',
			'saturated fats are found in butter, cheese, red meat and other animal-based foods'
		);