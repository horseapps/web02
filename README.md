## SnapJS 2.0

The SnapJS 2.0 uses Angular 2+ for the web client and Node, Express, Mongo for the API. Some things to keep in mind when using this seed project:

* Use the `server/app/company` and `client/app/company` as examples of good [CRUD](https://en.wikipedia.org/wiki/Create,_read,_update_and_delete)
* Reference the [SnapMobile Team Wiki](https://github.com/SnapMobileIO/team-wiki) for code, API, review, and team standards

## Installation

#### Get up and running...

* Download files and install packages: `npm install`

#### Create Environment File

* Create your own `.env` file by duplicating the `.env.example` file ([more info here](#create-and-update-env))
* Make sure to create a random string for the `SESSION_SECRET` and `JWT_SECRET`
* Update your local database name to match the client name (or whatever, doesn't really matter since this is only on your machine)
* You can wait on the other variables until you need the specific feature


#### Start Server

* Start the server with `npm start`
* Uses Nodemon to automatically restart server when changes are made
* Server runs on port 3000 locally: [http://localhost:3000](http://localhost:3000)


#### Start Client / Angular Dev Server

* Start the Angular app with `ng serve`
* Uses Angular CLI ([more here](https://cli.angular.io/))
* Rebuilds when changes are made (sometimes templates don't though)
* Runs locally on port 4200: [http://localhost:4200](http://localhost:4200)


#### Setup Admin User And Admin Portal

_(TODO: Changing soon to be via seed file)_

* Use the API to register a new user
* After you create the user, use [robomongo](https://robomongo.org) or command line to add `admin` to the user's roles array.
* _(Work in progress!)_ Now you should be able to access [http://localhost:4200/admin](http://localhost:4200/admin)

#### Done!


## MongoDB

If you haven't install MongoDB on your local machine yet...

`brew update`

`brew install mongodb`

(more info [here](https://docs.mongodb.org/manual/tutorial/install-mongodb-on-os-x/))

#### Create local MongoDB database ([more info](https://docs.mongodb.org/manual/tutorial/install-mongodb-on-os-x/#create-the-data-directory))

1. `mkdir <where you want to store your mongo database>`
2. `cd <your new mongo folder>`
3. `mkdir -p ./data/db`

#### Run MongoDB Locally ([more info](https://docs.mongodb.org/manual/tutorial/install-mongodb-on-os-x/#specify-the-path-of-the-data-directory))

`mongod --dbpath ~/<your mongo folder>/data/db`


## Create and update .env

We are using .env to store our local environment variables. These are specific to each developer's machine and will get overwritten for each environment when uploading to staging / production on Heroku. More info about [dotenv here](https://github.com/motdotla/dotenv).

1. Copy the `.env.example` and rename to `.env` in the root directory
2. Do not delete .env.example since this needs to be saved in the repo
3. Do not add the new .env file to the repo (it's in .gitignore, so you shouldn't)
4. Ask someone who knows, for the variable values :D


## Angular CLI

This project was generated with [Angular CLI](https://github.com/angular/angular-cli) version 1.0.0-beta.31.

#### Code scaffolding

Run `ng generate component component-name` to generate a new component. You can also use `ng generate directive/pipe/service/class/module`.

#### Build

Run `ng build` to build the project. The build artifacts will be stored in the `dist/` directory. Use the `-prod` flag for a production build.

#### Running unit tests

Run `ng test` to execute the unit tests via [Karma](https://karma-runner.github.io).

#### Running end-to-end tests

Run `ng e2e` to execute the end-to-end tests via [Protractor](http://www.protractortest.org/).
Before running the tests make sure you are serving the app via `ng serve`.

#### Further help

To get more help on the Angular CLI use `ng help` or go check out the [Angular CLI README](https://github.com/angular/angular-cli/blob/master/README.md).



