jsa
===

Javascript multiframed application with top frame as modules aggregator

<hr>
My links to git docs (just for myself)
<br/>
http://habrahabr.ru/post/60030/ - git russian easy
<br/>
http://git-scm.com/book/ru  -- git russian
<br/>
http://habrahabr.ru/post/136847/
<br/>
http://evasive.ru/articles/git_kung-fu.html -- git stash
<br/>

<pre>
Main git commands

# switch to local develop branch
$ git checkout develop

# switch to local master branch
$ git checkout master


# mark all files
$ git add .

# commit changes
$ git commit -am "Added develop file tag"

# send to remotes/origin/develop
$ git push

# if somebody changed any - download made changes
$ git pull
# .. and repeat
$ git push

# Show all local and remote branches
$ git branch -a

# Link local branch develop with remote develop
$ git checkout -b develop origin/develop
$ git checkout --track origin/develop
