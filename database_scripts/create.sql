DROP TABLE IF EXISTS favorites.FavoriteSearches;
DROP TABLE IF EXISTS favorites.Servings;
DROP TABLE IF EXISTS favorites.User;
DROP TABLE IF EXISTS favorites.Foods;
DROP TABLE IF EXISTS favorites.AgeGroup;
DROP TABLE IF EXISTS favorites.RecommendedDailyIntake;
DROP TABLE IF EXISTS favorites.NutrientInformation;



CREATE TABLE IF NOT EXISTS favorites.Foods (
	food_id int(20) not null,
    food_name varchar(200) not null,
    food_type varchar(100),
    food_url varchar(200),
    CONSTRAINT Favorites_pk PRIMARY KEY (food_id)
);

CREATE TABLE IF NOT EXISTS favorites.Servings (
	serving_id int AUTO_INCREMENT,
    food_id int(20) not null,
	date datetime,
    serving_amount int(6),
    calcium int(6),
    calories int(6),
    carbohydrate int(6),
    fat int(6),
    fiber int(6),
    iron int(6),
    monounsaturated_fat int(6),
    polyunsaturated_fat int(6),
    potassium int(6),
    protein int(6),
    saturated_fat int(6),
    sodium int(6),
    sugar int(6),
    vitamin_a int(6),
    vitamin_b int(6),
    vitamin_c int(6),
    CONSTRAINT Serving_pk PRIMARY KEY (serving_id),
    CONSTRAINT Serving_fk FOREIGN KEY (food_id) REFERENCES favorites.Foods(food_id)
);

CREATE TABLE IF NOT EXISTS favorites.User (
	user_id int(20) not null,
    firstName varchar(50),
    lastName varchar(50),
    CONSTRAINT User_pk PRIMARY KEY (user_id)
);

CREATE TABLE IF NOT EXISTS FavoriteSearches (
	user_id int(20) not null,
    serving_id int(20) not null,
    num_requests int(10) not null,
    CONSTRAINT FavoriteSearches_pk PRIMARY KEY (user_id, serving_id),
	CONSTRAINT FavoriteSearches_fk1 FOREIGN KEY (user_id) REFERENCES favorites.User(user_id),
	CONSTRAINT FavoriteSearches_fk2 FOREIGN KEY (serving_id) REFERENCES favorites.Servings(serving_id)
);

CREATE TABLE IF NOT EXISTS RecommendedDailyIntake (
	age_group varchar(30) not null,
    gender varchar(20) not null,
    vegetables varchar(30),
    fruit varchar(30),
    grains varchar(30),
    meat varchar(30),
    dairy varchar(30),
    other varchar(30),
    CONSTRAINT RecomendedDaily_pk PRIMARY KEY (age_group, gender)
);

CREATE TABLE IF NOT EXISTS AgeGroup (
    age_group varchar(60) not null,
    lower_limit int(4),
    upper_limit int(4),
    group_label varchar(40) not null,
    CONSTRAINT AgeGroup_pk PRIMARY KEY (age_group, lower_limit, upper_limit),
    CONSTRAINT AgeGroup_fk FOREIGN KEY (age_group) REFERENCES favorites.RecommendedDailyIntake(age_group)
);

CREATE TABLE IF NOT EXISTS NutrientInformation (
    name varchar(50) not null,
    description varchar(300) not null,
    sources varchar(300) not null,
    CONSTRAINT NutrientInfo_pk PRIMARY KEY (name)
);
