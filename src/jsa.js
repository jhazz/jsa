/**
 * @fileoverview The main module file
 * Loads in the topmost window and carry all libraries using by the child frames
 * @author Vlad Zbitnev
 */

/*jslint eqeq:true, indent: 4, maxerr: 230, white: true, browser: true, evil: true, nomen: true, plusplus: true, sloppy: true */
/*jshint curly:true */
/**
 * @define {boolean} Overridden to true by the compiler when --closure_pass
 *     or --mark_as_compiled is specified.
 */
var COMPILED = false;
/**
 * @define {boolean} May be exluded by compiler
 */
var CREATE_CONSOLE = true;

/**
 * @define {boolean} Debug mode keep debug messages in code
 */
var DEBUG = true;

var ACTION_JSA_CONSOLE_REGENERATE = 1;
var ACTION_JSA_CONSOLE_REARRANGE = 2;

var jsa;
(function() {
	jsa={
	/** @type {Object} */
	modules : {},
	/** @type {Object}*/
	moduleLoaders: {},
	/** @type {Object}*/
	classesByName: {},
	/** @type Array.<Object>*/
	stages : [],
	/** @type Array.<Function>*/
	actionByCode: [],
		
	/** @type {Object} */
	actionByName:{},
		
	/** @type {number|null} */
	time:0,
		
	/** @type {Object|integer} */
	isAppWindow:1,
		
	/** @type {Window} */
	win:window,
		
	/** @type {Document} */
	doc:document,
		
	/** @type {Object} dependencies */
	deps: {},
		
	/** @type Array.<Object> registered IFrames by registerIFrame */
	frames:{},
		
	/** @type {Object}*/
	actions:{},
		
	/** @type {string} Path to the library*/
	LIB_URL:"src/",

	/** @type {number} *Default time interval for newest timelines in msec (100ms=10fps) */
	STAGE_TIMER_INTERVAL : 2000,
	/** @type {number} adds random number to url query */
	UNCACHEABLE_URLS : 1,

	/** @type {number} uid */
	lastUID: 0,
		
	nullFunction: function () {},

	name:'jsa',

	subscribers:{},
	/**
	* Executes on class ready after load or inline
	* @param {Object} classDef Class object 
	* @param {String} classDef.clsName class name
	* @param {Array} classDef.deps array of module urls/names the class depends on
	* @param {Function} classDef.inherits
	* @param {Function} classDef.constructor
	* @return {Object}
	* ВНИМАНИЕ! define определяет как модули так и классы
	*/
	define : function (classDef) {
		if(!classDef.constructor) {
			classDef.constructor=function(){};
		}
		if(classDef.methods){
			classDef.constructor.prototype=classDef.methods;
		}
		if (classDef.inherits) {
			jsa.inherits(classDef.constructor, classDef.inherits.constructor);
		}
		if (DEBUG && (!classDef.clsName)) {
			throw new Error("Class should has a .clsName value defining a class namespace");
		}
		return classDef.constructor;
	},
			
	/**
	* @param {!Object} childConstructor that parentConstructor prototype applying to
	* @param {!Object} parentConstructor gives prototype methods to child
	* to call inherited do this:
	*  {myClass}.superClass_.{inheritedMethod}.call(this);
	*/
	inherits : function (childConstructor, parentConstructor) {
		// TODO(jhazz): check calling of superclass
		/** 
		* @constructor
		* @ignore
		*/
		function TempConstructor(){}
		TempConstructor.prototype = parentConstructor.prototype;
		childConstructor._superClass = parentConstructor.prototype;
		childConstructor.prototype = new TempConstructor();
		childConstructor.prototype.constructor = childConstructor;
	},
		
	/**
	* Copy hash from source to destination
	* @param {*} destination hash that values to be copied to
	* @param {*} source hash
	*/
	copy : function (destination, source) {
		var i;
		if (typeof source == 'object') {
			for (i in source) {
				if (source.hasOwnProperty(i)){
					destination[i] = source[i];
				}
			}
		} else{
			destination=source;
		}
	},
	/**
	* Add event dispatcher to any DOM object
	* @param {string} event name (i.e. 'load','click','mouseover')
	*/
	on:function(eventName,callback,target){
		eventName=eventName.toLowerCase();
		if(!target) {
			target=document;
		}
		if (!!target.addEventListener){
			target.addEventListener(eventName,callback,true);
		} else {
			target.attachEvent('on'+eventName,callback);
		}
	},

	/**
	* Loads js file
	* @param {string} jsPath to the loading script
	* @param {string} name of the module
	* @param {Object} doNext Actions runs after loading module if success or fail
	* @param {(string|Array)=} doNext.fail Action that runs on fail the loading
	* @param {(string|Array)=} doNext.run Action that runs on successful loading
	* @return {Object} loader record
	*/
	loadJS : function (jsPath, name, doNext) {
		var s,doc = jsa.doc,jsElement = doc.createElement("script"),loader;
		
		if (!name) {
			name = jsPath;
		}
		jsElement.type = 'text/javascript';
		jsElement.onload = jsElement.onreadystatechange = function () {
		/** @this {Element} */
			if (loader.loading && (!this.readyState || this.readyState == "loaded" || this.readyState == "complete")) {
				this.onreadystatechange = this.onload = "";
				loader.loading = 0;
				loader.success = 1;
				if (!!loader.run){
					jsa.run(loader.run);
				}
			}
		};
		doc.getElementsByTagName("head")[0].appendChild(jsElement);
		s = jsPath + ((jsa.UNCACHEABLE_URLS) ? ((jsPath.indexOf('?') + 1) ? '&' : '?') + '~=' + Math.random() : "");
		jsElement.src = s;
			
		/** @this {Element} */
		loader = jsa.moduleLoaders[name] = {
			name : name,
			jsDOMElement : jsDomElement,
			jsPath : jsPath,
			loading : 1,
			success : 0
		};
		jsa.mixin(loader, doNext, 1);
		return loader;
	},
		

	/**
	* Put log data in debug environment
	* @param {String|Object} msg text logging to active console
	* @param {Number=} warningMode means that text appear as warning in log
	* @param {String} any text representing context of log
	*/
	log : function (msg, warningMode,contextName) {},

	getUID : function (prefix) {
		return (prefix || "id") + (jsa.lastUID++);
	},


	/**
	* Push act object to the stage
	* @param {Object} act What should to run next tick
	* @param {jsa.Stage} act._stage timeline aggregator
	*/	
	pushToStage : function (act) {
		var stageId,stage;
		if (act._stage) {
			stage = act._stage;
		} else {
			stageId = act._stageId;
			if (!stageId) {
				act._stageId = stageId = 'Stage1';
			}
			stage = jsa.stages[stageId];
			if (!stage) {
				stage = jsa.createStage(stageId);
			}
		}
		act.stage = stage;
		
		// Действия делятся на те, которые выполняются в конце (after) и остальные в обычном временной линии
		if(act.aidAfter){
			stage.timelineAfter[act.aidAfter] = act;
		}else{
			if(!act.aid) {
				act.aid = jsa.getUID("a");
			}
			stage.timeline[act.aid] = act;
		}
		
		
		if (!stage.hTimer) {
			jsa.runStage(stage);
		}
		return act;
	},

	/**
	* Put log data in debug environment
	* @param {string} stageId Stage identificator
	* @param {number=} timerInterval timing interval between refreshment
	* @param {Object} stage referencing object. If it removed stage will be stopped and deleted too
	*/
	createStage : function (stageId, timerInterval,targetHtmlElement) {
		return jsa.stages[stageId] = {
			stageId : stageId,
			hTimer : 0,
			targetHtmlElement: targetHtmlElement || jsa.doc, 
			timerInterval : timerInterval || jsa.STAGE_TIMER_INTERVAL,
			timeline : {},
			timelineAfter:{} // для вызова различных обновлений в конце отрисовки кадра
		};
	},

	runStage : function (stage) {
		stage.hTimer = jsa.win.setInterval(function () {
				jsa.stageTick(stage);
			}, stage.timerInterval);
	},
	
	runStageId : function (stageId) {
		var stage = jsa.stages[stageId];
		if ((!!stage) && (!stage.hTimer)) {
			jsa.runStage(stage);
		}
	},

	stageTick : function (stage) {
		var act,n = 0,i,r,eliminate = [];
		if(stage.targetHtmlElement){
			for (i in stage.timeline) {
				act = stage.timeline[i];
				n++;
				if (typeof(act.f) == 'function') {
					//try{
						r = (act.f)(act);
					//}catch(e){window.status='Error in action '+e.message;}
					if (r != 'continue'){
						eliminate.push(act);
					}
				}
			}
			n = eliminate.length;
			if (n) {
				while ((act = eliminate.pop())) {
					delete stage.timeline[act.aid];
					n--;
				}
			}
		
			for (i in stage.timelineAfter) {
				act = stage.timelineAfter[i];
				n++;
				if (typeof(act.f) == 'function') {
					r = (act.f)(act);
					if (r != 'continue') {
						eliminate.push(act);
					}
				}
			}
			n = eliminate.length;
			if (n) {
				while ((act = eliminate.pop())) {
					delete stage.timelineAfter[act.aidAfter];
					n--;
				}
			}
		}
		
		if (!n) {
			jsa.win.clearInterval(stage.hTimer);
			stage.hTimer = 0;
		}
	},
		
		//jsa.registerModule({name:'sys.ui.Control',requires:['sys.ui.Data'],constructor:function(){}});
		
		
	/**
	* Asynchrous call the action or actions. If action is a set of actions run
	* fires these actions independently without control. If action class
	* unavailable it enqueue action to the timeline
	*
	* @param {(string|Array|number|Function)} action name (i.e. 'ui.control.Button.hide') or action[]
	* @param {Object=} act Arguments of the action that pushes to the actions chain
	*   @param {Number=} act.start Delay to deferred start in msec
	*   @param {Number=} act.timeout Maximum delay after start to break the process
	*       and follow the fail chain
	*   @param {(string|Array|null)} act.fail Action if fail (if error or timeout occured)
	*   @param {(string|Array|null)} act.next Action if action is done. Action may
	*       repeatedly call itself and goes next after a while
	*   @param {Object=} act._ target object
	*   @param {Number=} act.f action reference to the calling Function
	*   @param {Number=} act.c action code (only if act.a is not set)
	*   @param {String=} act.n action name using (only if act.ac is not set)
	*   @param {Number=} act.aid action must be called only once per tick!
	*   @param {Number=} act.aidAfter action must be called only once per tick after all act.aid
	*   @param {Object=} act.jsf - frame the run called from
	*   @param {String=} act.stageId stage of timelines with its own framerate and
	*       timer. Be aware from multiple stages
	* @this {jsa.act} act
	*/
	run : function (act) {
		var ac,an,f=act.f,s;
		if (act.start !== undefined) {
			act._startTime = jsa.time + act.start;
		}
		if(!f){
			if((ac=act.c)) {
				act.f=f=jsa.actionByCode[ac];
			} else {
				if((an=act.n)){
					f=jsa.actionByName[an];
					if(!f){
						var parts = an.split('.'),
							method = parts.pop(),
							moduleName = parts.join('.'),
							jsPath = parts.join('/').toLowerCase();
						if (!jsa.modules[moduleName]) {
							// Deferred call
							// Module with this namespace like 'ui.control.Button' has not been loaded
							// Let's check if it does not loading  '{libURL}/ui/control/button.js'
							
							if (!jsa.moduleLoaders[moduleName]) {
								// if module file didn't enqueued to loading let's load it
								act.stillLoading=1;
								s = jsa.LIB_URL + jsPath + ".js";
								if(DEBUG){
									console.log("Loading script " + s);
								}
								jsa.loadJS(s, moduleName, {run: act, fail: act.fail});
								return 1;
							}
						}else{
							if (DEBUG) {
								console.log('jsa.run error: Module '+moduleName+' has been loaded but action named as '+an+' is undefined');
							}
							return 0;
						}
					}
				
				}else{
					if(DEBUG) {
						console.log('run: Undefined action');
					}
					return 0;
				}
			}
		}
		return jsa.pushToStage(act);
	},
		
	/**
	* @param {String} tpl html template with {} expressions
	* @param {Object=} scopeObject object that provide its vars or methods
	*/
	parsedHTML : function (tpl, scopeObject) {
		return tpl.replace(/\{([^}]+)\}/g, function (j, i) {
			/** @ignore - google closure warns about using keyword with() */
			/** don't use jslint */
			with (scopeObject) {
				try {
					return eval('(' + i + ')');
				} catch (x) {
					return "{" + i + " "+x.message+"}";
				}
			}
		});
	},
	
	/**
	* @param {String} id name of the tag, i.e. div
	* @param {Object=} attrs list of tag attributes
	* @param {HTMLElement=} into HTML element to put newly created element inside
	* @param {String=} tpl html template
	* @param {Object=} scopeObject object that provide its vars or methods. If object is none tpl is stay unparsed
	*/
	createDiv : function (id, attrs, into, tpl, scopeObject) {
		var s,i,j,	c = ((!!into) ? into.ownerDocument : jsa.doc).createElement('div');
		c.setAttribute('id', id);
		if (attrs) {
			for (i in attrs) {
				s = attrs[i];
				if (i == 'style'){
					for (j in s){
						c.style[j] = s[j];
					}
				}else{
					c.setAttribute(i, s);
				}
			}
		}
		if (!!tpl){
			c.innerHTML = (!scopeObject) ? tpl : jsa.parsedHTML(tpl, scopeObject);
		}
		if (!!into){
			into.appendChild(c);
		}
		return c;
	},

	registerFrame: function (window,windowName) {
		return new jsa.Frame(window,jsa,windowName);
	},
	
	/**
	* Subscription of subObj.subMethod to pubObj.<pubEvent>
	* fills jsa.subscribers[pubObjNames][subObjNames][eventNames]=[subObj,subMethod]
	* @param {object} publisher Object that spread event
	* @param {string} event name 
	* @param {object} subscriber object that subscribing to publishing event notify
	* @param {function} subscriber object method activating by callback
	*/
	sub:function(pubObj,eventName,subObj,subMethod) {
		var v,evs,subs;
		if(!pubObj.name){
			console.error('sub: pubObj has no name');
			return false;
		}
		if(!subObj.name){
			console.error('sub: subObj has no name');
			return false;
		}
		subs=jsa.subscribers[pubObj.name];
		if(!subs){
			subs=jsa.subscribers[pubObj.name]={};
		}
		evs=subs[subObj.name];
		if(!evs){
			evs=subs[subObj.name]={};
		}
		v=evs[eventName];
		if(!v){
			v=evs[eventName]=[subObj,subMethod];
		}
	},
	
	pub:function(pubObj,eventName,eargs) {
		var sObjName,evs,subs=jsa.subscribers[pubObj.name],v;
		if(subs) {
			for(sObjName in subs) {
				evs=subs[sObjName];
				v=evs[eventName];
				if(!!v){
					(v[0])[v[1]](eargs);
					// jsa.run({_:v[0],f:v[1],args:eargs})
				}
			}
		}
	}
};
})();


/**
* @class jsa.GridDataProvider
*/
jsa.GridDataProvider=function(){
	this.name=jsa.getUID('dgp');
	this.data={};
};
jsa.GridDataProvider.prototype={
	pasteData:function(destRange,data){
		var r,c,srcRow,ic,row,dr=destRange[0],dc=destRange[1];
		for (r in data){ //0..rowMax-1
			srcRow=data[r];
			row=this.data[dr];
			if(!row){
				row=this.data[dr]={};
			}
			for (c in srcRow){
				ic=parseInt(c);
				row[dc+ic]={value:srcRow[c]};
			}
			dr++;
		}
		jsa.pub(this,'afterChange',{range:destRange});
	}
};

/*
 * @class jsa.Frame
 */
jsa.Frame=jsa.define({
	clsName:'jsa.Frame',
	constructor:function(window,name){
		var _=this;
		_.jsa=window.top.jsa;
		_.name=name;
		_.win=window;
		_.doc=window.document;
		_.jsa.frames[name]=_;	
	},
	methods:{
		replaceConsole:function(){
			if(CREATE_CONSOLE){this.win.console=jsa.console;}	
		},
		run : function (act) {
			/** @this jsa.Frame */
			act.win=this.win;
			act.jsf = this;
			return jsa.run(act);
		},
		find : function (id) {
			/** @this jsa.Frame */
			return this.doc.getElementById(id);
		}
	}
});


if(CREATE_CONSOLE){
	/** @class jsa.Console */
	jsa.Console=jsa.define({
		// class static
		clsName : 'Console',
		/** @constructor */
		methods:{
			init:function(aTargetWindow,container) {
				var _ = this;
				_.win = aTargetWindow || window;
				_.doc = _.win.document;
				_.options={mainMenuHeight:20,monitorSize:0.3, logSize:0.4,pBorderSize:10,pSpacing:5};
				_.container=container || _.doc.body;
				_.timers={};
				_.curGroupEntry=0;
				_.curGroupIndent=0;
				_.consoleMonitor = 
					jsa.createDiv('consoleMonitor', {
						style : {
							position : 'absolute',
							left : '70%',
							top : 0,
							width : '30%',
							height : '400px',
							overflow:'hidden',
							backgroundColor : '#e0ffe0'
						}
					},
					_.container);
					
			
				var tmpl = {
					style : {
						position : 'absolute',
						left : 0,
						top : 0,
						overflow:'auto',
						width : '50px',
						height : '50px',
						backgroundColor : '#ffffe0'
					}
				};
				_.consoleWatch = jsa.createDiv('consoleWatch', tmpl, _.consoleMonitor, 'Console watch');
				_.consoleLog = jsa.createDiv('consoleLog', tmpl, _.consoleMonitor, 'Console log');
				
				
				/** @type {Array} **/
				_.logData = [];
				
				jsa.on('resize',function(){jsa.run({_:_,f:_.rearrange,aid:ACTION_JSA_CONSOLE_REARRANGE});},_.win);
				jsa.run({_:_,f:_.rearrange,aid:ACTION_JSA_CONSOLE_REARRANGE});
			},
			group: function (groupName){
				this.addLog(arguments,5); // 5-group opened
			},
			groupCollapsed:function(groupName){
			},
			time: function(timerName){
				this.timers[timerName]=new Date();
			},
			timeEnd:function(timerName){
				if(this.timers[timerName]) {
					this.info(timerName+": "+Number(new Date()-this.timers[timerName])/1000+" sec");
				}
			},
			/** 
			@param {*} puts any data to local debugger
			*/
			log:function(){
				this.addLog(arguments,1); // 1-info
			},
			info:function(){
				this.addLog(arguments,1); // 1-info
			},
			warn:function(){
				this.addLog(arguments,2); // 2-warning
			},
			error:function(){
				this.addLog(arguments,3); // 3-error
			},
			groupEnd:function(groupNameOptional){
				var _=this,i=_.curGroupEntry;
				if(!i){
					_.warn("Called Console.groupEnd() without Console.group()");
				}else{
					_.curGroupEntry=_.logData[i][2];
					_.curGroupIndent--;
				}
			},
			addLog :function (args, mode) {
				var i,v=[],_ = this,logEntry=[];
				for(i=0;i<args.length;i++){
					v.push(args[i].toString());
				}
				logEntry=[v, mode, _.curGroupEntry, _.curGroupIndent];
				if(mode==5){_.curGroupEntry=_.logData.length;_.curGroupIndent++;}
				_.logData.push(logEntry);
				jsa.run({f : _.regenerate,_:_, aidAfter:ACTION_JSA_CONSOLE_REGENERATE});
			},

			regenerate:function(act) {
				var _ = act._, e, df, d=_.doc, logEntry,n = _.logData.length, i,j,v,s;
				if(DEBUG){if(!d){alert('jsa.console.regenerateConsole called out of console context');return;}}
				if(_.lastAdded<n){
					df=d.createDocumentFragment();
					for(i=_.lastAdded;i<n;i++){
						logEntry=_.logData[i];
						e=d.createElement("div");
						v=logEntry[0];
						s="";
						for(j=0;j<v.length;j++){
							s+="<td class='log'>"+v[j]+"</td>";
						}
						if(logEntry[3]>0){
							s="<td class='log' width='"+(logEntry[3]*10)+"'>&nbsp;</td>"+s;
						}
						s="<table cellspacing=0 cellpadding=0 border=0><tr>"+s+"</tr></table>";
						e.innerHTML=s;
						df.appendChild(e);
					}
				_.lastAdded=i;
				_.consoleLog.appendChild(df);
				}
			},
			rearrange:function (act) {
				var _=act._, b=_.container, w=b.clientWidth, h=b.clientHeight, pw,ph, ls, 
					stMonitor=_.consoleMonitor.style, lab=_.labIFrame, stLab, stLog=_.consoleLog.style, 
					stWatch=_.consoleWatch.style, o=_.options,borderSize=o.pBorderSize,spacing=o.pSpacing,mmHeight=o.mainMenuHeight;
				// _.options={monitorSize:0.3, logSize:0.4,pBorderSize:1,pSpacing:2};
				
				if (lab) {
					stLab=lab.style;
				}
				if(w>h){
					pw=Math.round(w * o.monitorSize);
					ph=h;
					stMonitor.height=ph-mmHeight-borderSize*2+"px";
					stMonitor.left=(w-pw-borderSize)+"px";
					stMonitor.top=borderSize+mmHeight+"px";
					stMonitor.width=pw+"px";
					if(!!lab){
						stLab.left=borderSize+"px";
						stLab.top=mmHeight+borderSize+"px";
						stLab.width=(w-pw-borderSize*2-spacing)+"px";
						stLab.height=(h-borderSize*2-mmHeight)+"px";
					}
					
					ls=Math.round(o.logSize*h);
					stWatch.width=stLog.width=pw+"px";
					stLog.height=ls;
					stLog.top="0px";
					stWatch.left=stLog.left="0px";
					
					stWatch.height=ph-ls-o.pSpacing-mmHeight;
					stWatch.top=ls+spacing;
					
				}else{
					ph=Math.round(h*o.monitorSize);
					pw=w;
					stMonitor.height=ph+"px";
					stMonitor.top=(h-ph-borderSize)+"px";
					stMonitor.left=borderSize+"px";
					stMonitor.width=w-borderSize*2+"px";
					
					if(!!lab){
						stLab.left=borderSize+"px";
						stLab.top=mmHeight+borderSize+"px";
						stLab.width=w-borderSize*2+"px";
						stLab.height=(h-mmHeight-ph-borderSize*2-spacing*2)+"px";
					}
					ls=Math.round(o.logSize*w);
					stLog.width=ls+"px";
					stWatch.height=stLog.height=ph+"px";
					stWatch.top=stLog.top="0px";
					stLog.left="0px";
					
					stWatch.left=ls+spacing+"px";
					stWatch.width=pw-spacing-ls+"px";
				}
			
			}
			
		},
		constructor : function () {
			this.lastAdded=0;
			this.name="jsa.console";
		}

	});

} // CREATE_CONSOLE

jsa.on('load',function(){
	/** @this window */
	jsf=jsa.registerFrame(window,"AppTopWindow");
	if (CREATE_CONSOLE)	{
		jsa.console = new jsa.Console();
		jsa.console.labIFrame=jsf.find("labiframe1");
		jsa.console.init(window);
		jsa.actionByCode[ACTION_JSA_CONSOLE_REGENERATE] = jsa.actionByName['jsa.console.regenerate'] = jsa.console.regenerate;
		jsa.actionByCode[ACTION_JSA_CONSOLE_REARRANGE] = jsa.actionByName['jsa.console.rearrange'] = jsa.console.rearrange;
		jsf.replaceConsole();
		console.log('Console module starts');
	}
},window);

if (!COMPILED) {
	// This block will be rejected by compiler
	console.log("Non-compiled mode");
}




jsa.createControl=function(vmodel,dmodel,htmlContainer,parentCtrl){
	var ctrl,cls=vmodel.ctrl||'Control',classDef=jsa[cls];
	if(!classDef){
		if(DEBUG){
			console.log('Undefined class '+cls);
		}
	}
	debugger;
	ctrl=new (classDef)();
	ctrl.put(vmodel,dmodel,htmlContainer,parentCtrl);
};

/**
	@class jsa.Control
*/

jsa.Control=function(a) {
	if(!!a){
		jsa.copy(this,a);
	}

};
jsa.Control.prototype={
	_className:"jsa.Control",
	
	put:function(viewModel,dataProvider,htmlContainer,parentCtrl){
	// viewModel is a JSON template. {t:'div',width:100,position:'absolute',height:200,idp:'idprefix',before:"evalCodeBeforeChild",_:[t:'ul',a:{type:'circle'}],after:"evalCodeAfterCreate"}
		var kc,htmlTag=viewModel.tag||'div',kid,s,i,j,targetElement=((!htmlContainer) ? jsa.doc : htmlContainer.ownerDocument).createElement(htmlTag);
		//targetElement.setAttribute('id', id);
	
		this.viewModel=viewModel;
		this.dataProvider=dataProvider;
		this.parentCtrl=parentCtrl;
		if (!!parentCtrl){
			if(!parentCtrl.kids) {
				parentCtrl.kids=[];
			}
			parentCtrl.kids.push(this);
		}
		if (!!viewModel.html) {
			targetElement.innerHTML=viewModel.html;
		}
		if (!!viewModel.thtml) {
			targetElement.innerHTML=jsa.parsedHTML(viewModel.thtml, this);
		}
		for (i in viewModel) {
			s = viewModel[i];
			if(i=='_'){
				for (j in s){ // array of child elements
					kc=s[j];
					jsa.createControl(kc,dataProvider,targetElement,this);
					//kid=new jsa[kc.ctrl||'Control']();
					//kid.put(s[j],dataProvider,targetElement,this);
				}
			}else if(i=='a') { // attrs
				for (j in s) {
					targetElement.setAttribute(j, s[j]);
				}
			}else if(i=='s') { // style
				for (j in s) {
					targetElement.style[j]=s[j];
				}
			}else if(i=='height'){
				if (s=='client'){
					height=parentCtrl.clientHeight;
				} else{
					targetElement.style.height=s+'px';
				}
			}else if(i=='width'){
				if (s=='client'){
					height=parentCtrl.clientWidth;
				} else{
					targetElement.style.width=s+'px';
				}
			}
		}
		
		if (!!htmlContainer) {
			htmlContainer.appendChild(targetElement);
		}
		this.element=targetElement;
	},
	anchor:function(id){
		return "[["+id+"_"+jsa.getUID()+"]]";
	}
};




/*
	
	// define a new type SkinnedMesh and a constructor for it
function SkinnedMesh(geometry, materials) {
  // call the superclass constructor
  THREE.Mesh.call(this, geometry, materials);
 
  // initialize instance properties
  this.identityMatrix = new THREE.Matrix4();
  this.bones = [];
  this.boneMatrices = [];
  ...
};
 
// inherit behavior from Mesh
SkinnedMesh.prototype = Object.create(THREE.Mesh.prototype);
SkinnedMesh.prototype.constructor = SkinnedMesh;
 
// define an overridden update() method
SkinnedMesh.prototype.update = function(camera) {
  ...
  // call base version of same method
  THREE.Mesh.prototype.update.call(this);
};
*/

