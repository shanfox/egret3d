/// <reference path="./EventDispatcher.ts" />
namespace paper.editor {
    export const context: EventDispatcher = new EventDispatcher();
    export enum selectItemType {
        GAMEOBJECT,
        ASSET
    }
    /**
     * 编辑模型事件
     */
    export class EditorModelEvent extends BaseEvent {
        public static ADD_GAMEOBJECTS = "addGameObject";
        public static DELETE_GAMEOBJECTS = "deleteGameObject";
        public static SELECT_GAMEOBJECTS = "selectGame";
        public static CHANGE_DIRTY: string = 'change_dirty';
        public static CHANGE_PROPERTY = "changeProperty";
        public static CHANGE_EDIT_MODE = "changeEditMode";
        public static CHANGE_EDIT_TYPE = "changeEditType";
        public static ADD_COMPONENT: string = "addComponent";
        public static REMOVE_COMPONENT: string = "removeComponent";
        public static UPDATE_GAMEOBJECTS_HIREARCHY: string = "updateGameObjectsHierarchy";
        public static SAVE_ASSET = "saveAsset";

        constructor(type: string, data?: any) {
            super(type, data);
        }
    }
    export enum ModifyObjectType {
        GAMEOBJECT,
        BASECOMPONENT
    }
    /**
     * 编辑模型
     */
    export class EditorModel extends EventDispatcher {

        private _history: History;
        public get history(): History {
            return this._history
        }
        private _scene: paper.Scene;
        public get scene(): Scene {
            return this._scene;
        }
        private _contentType: 'scene' | 'prefab';
        public get contentType() {
            return this._contentType;
        }
        private _contentUrl: string;
        public get contentUrl() {
            return this._contentUrl;
        }
        private _dirty: boolean = false;
        public get dirty(): boolean {
            return this._dirty;
        }
        public set dirty(v: boolean) {
            if (this._dirty !== v) {
                this._dirty = v;
                this.dispatchEvent(new EditorModelEvent(EditorModelEvent.CHANGE_DIRTY));
            }
        }
        /**
         * 初始化
         * @param history 
         */
        public init(scene: paper.Scene, contentType: 'scene' | 'prefab', contentUrl: string): void {
            this._history = new History();
            this._scene = scene;
            this._contentType = contentType;
            this._contentUrl = contentUrl;
        }

        public addState(state: BaseState | null) {
            if (state) {
                state.editorModel = this;
                this.history.add(state);
            }
        }

        public getEditType(propName: string, target: any): editor.EditType | null {
            const editInfoList = editor.getEditInfo(target);
            for (let index = 0; index < editInfoList.length; index++) {
                const element = editInfoList[index];
                if (element.name === propName) {
                    return element.editType;
                }
            }

            const extraInfoList = editor.getExtraInfo(target);
            for (let index = 0; index < extraInfoList.length; index++) {
                const element = extraInfoList[index];
                if (element.name === propName) {
                    return element.editType;
                }
            }

            return null;
        }

        public setTransformProperty(propName: string, propValue: any, target: BaseComponent): void {
            let valueEditType: paper.editor.EditType | null = this.getEditType(propName, target);

            if (valueEditType != null) {
                let newPropertyData = {
                    propName,
                    copyValue: this.serializeProperty(propValue, valueEditType),
                    valueEditType
                }

                let prePropertyData = {
                    propName,
                    copyValue: this.serializeProperty(target[propName], valueEditType),
                    valueEditType
                }

                this.createModifyComponent(target.gameObject.uuid, target.uuid, [newPropertyData], [prePropertyData]);
            }
        }

        public createModifyGameObjectPropertyState(gameObjectUUid: string, newValueList: any[], preValueCopylist: any[]) {
            let state = ModifyGameObjectPropertyState.create(gameObjectUUid, newValueList, preValueCopylist);
            this.addState(state);
        }

        public createModifyComponent(gameObjectUUid: string, componentUUid: string, newValueList: any[], preValueCopylist: any[]): any {
            let state = ModifyComponentPropertyState.create(gameObjectUUid, componentUUid, newValueList, preValueCopylist);
            this.addState(state);
        }

        public createAddComponentToPrefab(serializeData: any, gameObjIds: string[]) {
            // const state = AddPrefabComponentState.create(serializeData, gameObjIds);
            // this.addState(state);
        }

        public createModifyAssetPropertyState(assetUrl: string, newValueList: any[], preValueCopylist: any[]) {
            const state = ModifyAssetPropertyState.create(assetUrl, newValueList, preValueCopylist);
            this.addState(state);
        }

        public createPrefabState(prefab: any) {
            const state = CreatePrefabState.create({ prefab });
            this.addState(state);
        }

        public serializeProperty(value: any, editType: editor.EditType): any {
            switch (editType) {
                case editor.EditType.NUMBER:
                case editor.EditType.TEXT:
                case editor.EditType.CHECKBOX:
                    return value;
                case editor.EditType.VECTOR2:
                case editor.EditType.VECTOR3:
                case editor.EditType.VECTOR4:
                case editor.EditType.QUATERNION:
                case editor.EditType.COLOR:
                case editor.EditType.RECT:
                    const className = egret.getQualifiedClassName(value);
                    const serializeData = value.serialize(value);
                    return { className, serializeData };
                case editor.EditType.SHADER:
                    return value.url;
                case editor.EditType.LIST:
                    return value;
                case editor.EditType.MATERIAL_ARRAY:
                    const data = value.map((item) => {
                        let url = item.url.substr(RES.config.config.resourceRoot.length, item.url.length);
                        return { name: url, url: url };
                    })
                    return data;
                case editor.EditType.MESH:
                    let url = value.glTFAsset.url;
                    url = url.substr(RES.config.config.resourceRoot.length, url.length);
                    return url;
                case editor.EditType.MATERIAL:
                case editor.EditType.GAMEOBJECT:
                case editor.EditType.TRANSFROM:
                case editor.EditType.SOUND:
                case editor.EditType.ARRAY:
                    //TODO
                    console.error("not supported!")
                    break;
                default:
                    break;
            }
        }

        public async deserializeProperty(serializeData: any, editType: editor.EditType): Promise<any> {
            switch (editType) {
                case editor.EditType.NUMBER:
                case editor.EditType.TEXT:
                case editor.EditType.CHECKBOX:
                    return serializeData;
                case editor.EditType.VECTOR2:
                case editor.EditType.VECTOR3:
                case editor.EditType.VECTOR4:
                case editor.EditType.QUATERNION:
                case editor.EditType.COLOR:
                case editor.EditType.RECT:
                    const clazz = egret.getDefinitionByName(serializeData.className);
                    let target: ISerializable | null = null;
                    if (clazz) {
                        target = new clazz();
                        target!.deserialize(serializeData.serializeData);
                    }
                    return target;
                case editor.EditType.SHADER:
                    const url = serializeData;
                    const asset = await RES.getResAsync(url);
                    return asset;
                case editor.EditType.LIST:
                    return serializeData;
                case editor.EditType.MATERIAL_ARRAY:
                    const materials: egret3d.Material[] = [];
                    for (const matrial of serializeData) {
                        const asset = await RES.getResAsync(matrial.url);
                        materials.push(asset);
                    }
                    return materials;
                case editor.EditType.MESH:
                    let meshAsset = await RES.getResAsync(serializeData);
                    let mesh: egret3d.Mesh = new egret3d.Mesh(meshAsset, 0); // TODO
                    return mesh;
                case editor.EditType.MATERIAL:
                case editor.EditType.GAMEOBJECT:
                case editor.EditType.TRANSFROM:
                case editor.EditType.SOUND:
                case editor.EditType.ARRAY:
                    //TODO
                    console.error("not supported!")
                    return null;
                default:
                    break;
            }
        }

        public createGameObject(parentList: GameObject[], createType: string) {
            let state = CreateGameObjectState.create(parentList, createType);
            this.addState(state);
        }

        public addComponent(gameObjectUUid: string, compClzName: string) {
            let data = {
                gameObjectUUid: gameObjectUUid,
                compClzName: compClzName
            }
            let state = AddComponentState.create(gameObjectUUid, compClzName);
            this.addState(state);
        }

        public removeComponent(gameObjectUUid: string, componentUUid: string): void {
            let obj: GameObject | null = this.getGameObjectByUUid(gameObjectUUid);
            if (!obj) {
                return;
            }
            let removeComponent: BaseComponent | null = this.getComponentById(obj, componentUUid);
            if (!removeComponent) {
                return;
            }
            let serializeData = serialize(removeComponent);


            let state = RemoveComponentState.create(gameObjectUUid, componentUUid, serializeData);
            this.addState(state);
        }

        public getComponentById(gameObject: GameObject, componentId: string): BaseComponent | null {
            for (let i: number = 0; i < gameObject.components.length; i++) {
                let comp = gameObject.components[i];
                if (comp.uuid === componentId) {
                    return comp;
                }
            }
            return null;
        }

        public getComponentByAssetId(gameObject: GameObject, assetId: string): BaseComponent | null {
            for (let i: number = 0; i < gameObject.components.length; i++) {
                let comp = gameObject.components[i];
                if (comp.extras!.linkedID === assetId) {
                    return comp;
                }
            }
            return null;;
        }

        /**
         * 复制游戏对象
         * @param objs 
         */
        public copyGameObject(objs: GameObject[]): void {
            let clipboard = __global.runtimeModule.getClipborad();
            let content: any[] = [];
            //过滤
            this.filtTopHierarchyGameObjects(objs);
            //排序
            objs = this.sortGameObjectsForHierarchy(objs);
            for (let i: number = 0; i < objs.length; i++) {
                let obj = objs[i];
                content.push({
                    type: "gameObject",
                    serializeData: serialize(obj)
                })
            }
            clipboard.writeText(JSON.stringify(content), "paper");
        }
        /**
         * 粘贴游戏对象
         * @param parent 
         */
        public pasteGameObject(parent: GameObject): void {
            let clipboard = __global.runtimeModule.getClipborad()
            let msg = clipboard.readText("paper");
            let content: { type: string, serializeData: any }[] = JSON.parse(msg);
            if (content && content.length > 0) {
                let objData: any[] = [];
                for (let i: number = 0; i < content.length; i++) {
                    objData.push(content[i].serializeData);
                }
                let state = PasteGameObjectsState.create(objData, parent);
                this.addState(state);
            }
        }
        /**
         * 克隆游戏对象
         * @param gameObjects 
         */
        public duplicateGameObjects(gameObjects: GameObject[]): void {
            let state = DuplicateGameObjectsState.create(gameObjects, this);
            this.addState(state);
        }
        /**
         * 删除游戏对象
         * @param gameObjects 
         */
        public deleteGameObject(gameObjects: GameObject[]) {
            let deleteState = DeleteGameObjectsState.create(gameObjects, this);
            let breakList: GameObject[] = [];
            gameObjects.forEach(obj => {
                if (this.isPrefabChild(obj) && !this.isPrefabRoot(obj)) {
                    breakList.push(obj);
                }
            });
            if (breakList.length > 0) {
                let breakState = BreakPrefabStructState.create(breakList);
                let stateGroup = StateGroup.create([breakState, deleteState]);
                this.addState(stateGroup);
            }
            else {
                this.addState(deleteState);
            }
        }
        /**
         * 解除预置体联系
         * @param gameObjects 
         */
        public breakPrefab(gameObjects: GameObject[]): void {
            let breakList: GameObject[] = [];
            gameObjects.forEach(obj => {
                if (this.isPrefabChild(obj) || this.isPrefabRoot(obj)) {
                    breakList.push(obj);
                }
            });
            if (breakList.length > 0) {
                let breakState = BreakPrefabStructState.create(breakList);
                this.addState(breakState);
            }
        }
        /**
         * 更改层级
         * */
        public updateGameObjectsHierarchy(gameObjects: GameObject[], targetGameobjcet: GameObject, dir: 'top' | 'inner' | 'bottom'): void {
            let gameObjectHierarchyState = GameObjectHierarchyState.create(gameObjects, targetGameobjcet, dir, this);
            let breakList: GameObject[] = [];
            gameObjects.forEach(obj => {
                if (this.isPrefabChild(obj) &&
                    !this.isPrefabRoot(obj) &&
                    (obj.transform.parent !== targetGameobjcet.transform.parent || dir === 'inner')) {
                    breakList.push(obj);
                }
            });
            if (breakList.length > 0) {
                let breakPrefabStructState = BreakPrefabStructState.create(breakList);
                let stateGroup = StateGroup.create([breakPrefabStructState, gameObjectHierarchyState]);
                this.addState(stateGroup);
            }
            else {
                this.addState(gameObjectHierarchyState);
            }
        }
        /**
         * 设置对象的层级
         */
        public setGameObjectsHierarchy(objects: GameObject[], targetObject: GameObject, dir: 'top' | 'inner' | 'bottom'): void {
            objects = objects.concat();
            //剔除所有父级
            objects.forEach(obj => { obj.transform.parent = null; });
            objects.reverse();
            if (dir === 'inner') {
                let index = targetObject.transform.children.length;
                for (let i: number = 0; i < objects.length; i++) {
                    let obj = objects[i];
                    obj.transform.parent = targetObject.transform;
                    let transform = (targetObject.transform.children as Array<egret3d.Transform>).pop();
                    (targetObject.transform.children as Array<egret3d.Transform>).splice(index, 0, transform);
                }
            }
            else {
                if (targetObject.transform.parent) {
                    let index;
                    switch (dir) {
                        case 'top': index = targetObject.transform.parent.children.indexOf(targetObject.transform); break;
                        case 'bottom': index = targetObject.transform.parent.children.indexOf(targetObject.transform) + 1; break;
                    }
                    for (let i: number = 0; i < objects.length; i++) {
                        let obj = objects[i];
                        obj.transform.parent = targetObject.transform.parent;
                        let transform = (targetObject.transform.parent.children as Array<egret3d.Transform>).pop();
                        (targetObject.transform.parent.children as Array<egret3d.Transform>).splice(index, 0, transform);
                    }
                }
                else {
                    let all = paper.Application.sceneManager.activeScene.gameObjects as Array<paper.GameObject>;
                    for (let i: number = 0; i < objects.length; i++) {
                        all.splice(all.indexOf(objects[i]), 1);
                    }
                    let index;
                    switch (dir) {
                        case 'top': index = all.indexOf(targetObject); break;
                        case 'bottom': index = all.indexOf(targetObject) + 1; break;
                    }
                    for (let i: number = 0; i < objects.length; i++) {
                        let obj = objects[i];
                        all.splice(index, 0, obj);
                    }
                }
            }
        }
        /**
         * 筛选层级中的顶层游戏对象
         * @param gameObjects 
         */
        public filtTopHierarchyGameObjects(gameObjects: GameObject[]) {
            let findParent: boolean = false;
            let parent: egret3d.Transform | null = null;
            for (let index = gameObjects.length - 1; index >= 0; index--) {
                const element = gameObjects[index];
                findParent = false;
                parent = element.transform.parent;
                while (parent) {
                    for (let i = 0; i < gameObjects.length; i++) {
                        const element = gameObjects[i];
                        if (element.transform === parent) {
                            gameObjects.splice(index, 1);
                            findParent = true;
                            break;
                        }
                    }
                    if (findParent) {
                        break;
                    }
                    parent = parent.parent;
                }
            }
        }

        public getGameObjectByUUid(uuid: string): GameObject | null {
            let objects = paper.Application.sceneManager.activeScene.gameObjects;
            for (let i: number = 0; i < objects.length; i++) {
                if (objects[i].uuid === uuid) {
                    return objects[i];
                }
            }
            return null;
        }

        public async getAssetByAssetUrl(url: string): Promise<any> {
            let asset = await RES.getResAsync(url);
            if (asset) {
                return asset;
            }
            return null;
        }

        public getGameObjectsByUUids(uuids: string[]): GameObject[] {
            let objects = Application.sceneManager.activeScene.gameObjects;
            let obj: GameObject;
            let result: GameObject[] = [];
            let idIndex: number;
            let cloneIds: string[] = uuids.concat();
            for (let i: number = 0; i < objects.length; i++) {
                if (cloneIds.length == 0) {
                    return result;
                }
                obj = objects[i];
                idIndex = cloneIds.indexOf(obj.uuid);
                if (idIndex != -1) {
                    result.push(obj);
                    cloneIds.splice(idIndex, 1);
                }
            }
            return result;
        }

        private findOptionSetName(propName: string, target: any): string | null {
            const editInfoList = editor.getEditInfo(target);
            for (let index = 0; index < editInfoList.length; index++) {
                const element = editInfoList[index];
                if (element.name === propName && element.option && element.option.set) {
                    return element.option.set;
                }
            }

            const extraInfoList = editor.getExtraInfo(target);
            for (let index = 0; index < extraInfoList.length; index++) {
                const element = extraInfoList[index];
                if (element.name === propName && element.option && element.option.set) {
                    return element.option.set;
                }
            }

            return null;
        }

        public setTargetProperty(propName: string, target: any, value: any): void {
            let setFunName: string = this.findOptionSetName(propName, target);
            if (setFunName !== null && target[setFunName]) {
                (target[setFunName] as Function).call(target, value);
            } else {
                target[propName] = value;
            }
        }
        /**当前选中的对象 */
        public currentSelected: GameObject[];
        /**
         * 选择游戏对象
         *  */
        public selectGameObject(objs: GameObject[]): void {
            this.currentSelected = objs;
            this.dispatchEvent(new EditorModelEvent(EditorModelEvent.SELECT_GAMEOBJECTS, objs));
        }
        /**当前编辑模式 */
        public currentEditMode: string;
        /**
         * 切换编辑模式
         */
        public changeEditMode(mode: string) {
            this.currentEditMode = mode;
            this.dispatchEvent(new EditorModelEvent(EditorModelEvent.CHANGE_EDIT_MODE, mode));
        }
        /**
         * 切换编辑类型
         */
        public changeEditType(type: string) {
            this.dispatchEvent(new EditorModelEvent(EditorModelEvent.CHANGE_EDIT_TYPE, type));
        }

        public isPrefabRoot(gameObj: GameObject): boolean {
            if (gameObj.extras.prefab) {
                return true;
            }
            return false;
        }

        public isPrefabChild(gameObj: GameObject): boolean {
            if (gameObj.extras.prefabRootId) {
                return true;
            }
            return false;
        }
        /**将对象按照层级进行排序
         */
        public sortGameObjectsForHierarchy(gameobjects: paper.GameObject[]): paper.GameObject[] {
            gameobjects = gameobjects.concat();
            if (gameobjects.length < 2) {
                return gameobjects;
            }
            //生成每个对象的显示索引路径列表
            var displayPathList: { gameObject: paper.GameObject, path: number[] }[] = [];
            gameobjects.forEach(obj => {
                let result: number[] = [];
                let currentObj = obj;
                while (currentObj.transform.parent) {
                    result.unshift(currentObj.transform.parent.children.indexOf(currentObj.transform));
                    currentObj = currentObj.transform.parent.gameObject;
                }
                //追加一个根部索引
                result.unshift(paper.Application.sceneManager.activeScene.gameObjects.indexOf(currentObj));
                displayPathList.push({ gameObject: obj, path: result });
            });
            function getPath(gameObject: paper.GameObject): number[] {
                for (let i: number = 0; i < displayPathList.length; i++) {
                    if (displayPathList[i].gameObject === gameObject) {
                        return displayPathList[i].path;
                    }
                }
            }
            var length: number = gameobjects.length - 1;
            while (length > 0) {
                for (var i: number = 0; i < length; i++) {
                    var A: number[] = getPath(gameobjects[i]);
                    var B: number[] = getPath(gameobjects[i + 1]);

                    var needChangeIndex: boolean = false;
                    var minLength: number = Math.min(A.length, B.length);
                    let k: number = 0;
                    b: for (k; k < minLength; k++) {
                        if (A[k] === B[k]) {
                            continue;
                        }
                        else if (A[k] > B[k]) {
                            needChangeIndex = true;
                            break b;
                        }
                        else if (A[k] < B[k]) {
                            needChangeIndex = false;
                            break b;
                        }
                    }
                    if (k === minLength && !needChangeIndex && A.length > B.length) {
                        needChangeIndex = true;
                    }
                    if (needChangeIndex) {
                        var tmpv: any = gameobjects[i];
                        gameobjects[i] = gameobjects[i + 1];
                        gameobjects[i + 1] = tmpv;
                    }
                }
                length--;
            }
            return gameobjects;
        }

        public createApplyPrefabState(applyData: editor.ApplyData, applyPrefabInstanceId: string, prefab: paper.Prefab) {
            let state = ApplyPrefabInstanceState.create(applyData, applyPrefabInstanceId, prefab);
            this.addState(state);
        }

        public createRevertPrefabState(revertData:editor.revertData,revertPrefabInstanceId:string) {
            let state = RevertPrefabInstanceState.create(revertData,revertPrefabInstanceId);
            this.addState(state);
        }

        public deepClone<T>(obj: T): T {
            if (!obj || typeof obj !== 'object') {
                return obj;
            }
            if (obj instanceof RegExp) {
                return obj as any;
            }
            const result: any = Array.isArray(obj) ? [] : {};
            Object.keys(obj).forEach((key: string) => {
                if (obj[key] && typeof obj[key] === 'object') {
                    result[key] = this.deepClone(obj[key]);
                } else {
                    result[key] = obj[key];
                }
            });
            return result;
        }

        public updateAsset(asset:Asset,prefabInstance:GameObject | null = null)
        {
            const refs = this.findAssetRefs(Application.sceneManager.activeScene,asset);

            let serializeData:ISerializedData;
            if (asset instanceof Prefab) {
                serializeData = paper.serialize(prefabInstance!);

            }else{

            }

            //save asset

            //destory asset,getRes

            //update refrence (paper.assets[])

            this._cacheIds.length = 0;
        }

        private _cacheIds:string[] = [];

        private findAssetRefs(target: any, as: Asset, refs: any[] | null = null) {
            if (this._cacheIds.indexOf(target.uuid) >= 0) {
                return;
            }
        
            this._cacheIds.push(target.uuid);
        
            refs = refs || [];
        
            for (const key in target) {
                const source = target[key];
                if ((typeof source) === "object") {
                    this.findFromChildren(source, as, refs, target, key);
                }
            }
        
            return refs;
        }
        
        private findFromChildren(source: any, as: Asset, refs: any[], parent: any, key: any) {
            if ((typeof source) !== "object") {
                return;
            }

            if (Array.isArray(source) || ArrayBuffer.isView(source)) {
                for (let index = 0; index < (source as any).length; index++) {
                    const element = (source as any)[index];
                    this.findFromChildren(element, as, refs, source, index);
                }
            }
        
            if (source.constructor === Object) {
                for (const key in source) {
                    const element = source[key];
                    this.findFromChildren(element, as, refs, source, key);
                }
            }
        
            if (source instanceof BaseObject) {
                if (source instanceof Asset && source === as) {
                    refs.push({ p: parent, k: key });
                    return;
                }
        
                this.findAssetRefs(source, as, refs);
            }
        }

        public getAllGameObjectsFromPrefabInstance(gameObj: paper.GameObject, objs: paper.GameObject[] | null = null) {
            if (gameObj) {
                objs = objs || [];
                if (gameObj.extras!.linkedID) {
                    objs.push(gameObj);
                }
            }

            for (let index = 0; index < gameObj.transform.children.length; index++) {
                const element = gameObj.transform.children[index];
                const obj: paper.GameObject = element.gameObject;
                this.getAllGameObjectsFromPrefabInstance(obj, objs);
            }

            return objs;
        }
    }
}