import {
    IJsonPropertiesMapper,
    TJsonaModel,
    TJsonaRelationships,
    TJsonApiBody,
    TJsonApiData,
    IJsonaModelBuilder,
} from '../JsonaTypes';

function createEntityKey(data: TJsonApiData) {
    if (data.type && data.id) {
        return `${data.type}-${data.id}`;
    }

    return '';
}

class JsonDeserializer implements IJsonaModelBuilder {

    protected pm: IJsonPropertiesMapper;
    protected body;
    protected includedInObject;
    protected cachedModels = {};

    constructor(propertiesMapper) {
        this.setPropertiesMapper(propertiesMapper);
    }

    setPropertiesMapper(pm): void {
        this.pm = pm;
    }

    setJsonParsedObject(body: TJsonApiBody): void {
        this.body = body;
    }

    build(): TJsonaModel | Array<TJsonaModel> {
        const {data} = this.body;
        let staff;

        if (Array.isArray(data)) {
            staff = [];
            const collectionLength = data.length;

            for (let i = 0; i < collectionLength; i++) {
                if (data[i]) {
                    const model = this.buildModelByData(data[i]);

                    if (model) {
                        staff.push(model);
                    }
                }
            }
        } else if (data) {
            staff = this.buildModelByData(data);
        }

        return staff;
    }

    buildModelByData(data: TJsonApiData): TJsonaModel {

        const entityKey = createEntityKey(data);

        let model;

        if (entityKey) {
            // checks for built model in cachedModels is a protection from creating models on recursive relationships
            model = this.cachedModels[entityKey];

            if (model) {
                return model;
            }
        }

        model = this.pm.createModel(data.type);

        if (model) {
            if (entityKey) {
                this.cachedModels[entityKey] = model;
            }

            this.pm.setId(model, data.id);

            if (data.attributes) {
                this.pm.setAttributes(model, data.attributes);
            }

            if (data.meta && this.pm.setMeta) {
                this.pm.setMeta(model, data.meta);
            }

            if (data.links && this.pm.setLinks) {
                this.pm.setLinks(model, data.links);
            }

            const relationships: null | TJsonaRelationships = this.buildRelationsByData(data, model);

            if (relationships) {
                this.pm.setRelationships(model, relationships);
            }
        }

        return model;
    }

    buildRelationsByData(data: TJsonApiData, model: TJsonaModel): TJsonaRelationships | null {
        const readyRelations = {};

        if (data.relationships) {
            for (let k in data.relationships) {
                const relation = data.relationships[k];

                if (Array.isArray(relation.data)) {
                    readyRelations[k] = [];

                    const relationItemsLength = relation.data.length;
                    for (let i = 0; i < relationItemsLength; i++) {
                        let dataItem = this.buildDataFromIncluded(
                            relation.data[i].id,
                            relation.data[i].type
                        );
                        readyRelations[k].push(
                            this.buildModelByData(dataItem)
                        );
                    }
                } else if (relation.data) {
                    let dataItem = this.buildDataFromIncluded(relation.data.id, relation.data.type);
                    readyRelations[k] = this.buildModelByData(dataItem);
                }

                if (relation.links) {
                    const {setRelationshipLinks} = this.pm;
                    if (setRelationshipLinks) { // support was added in patch release
                        setRelationshipLinks(model, k, relation.links);
                    }
                }

                if (relation.meta) {
                    const {setRelationshipMeta} = this.pm;
                    if (setRelationshipMeta) { // support was added in patch release
                        setRelationshipMeta(model, k, relation.meta);
                    }
                }
            }
        }

        if (Object.keys(readyRelations).length) {
            return <TJsonaRelationships> readyRelations;
        }

        return null;
    }

    buildDataFromIncluded(id: string | number, type: string): TJsonApiData {
        const included = this.buildIncludedInObject();
        const dataItem = included[type + id];

        if (dataItem) {
            return dataItem;
        } else {
            return { id: id, type: type };
        }
    }

    buildIncludedInObject(): { [key: string]: TJsonApiData } {
        if (!this.includedInObject) {
            this.includedInObject = {};

            if (this.body.included) {
                let includedLength = this.body.included.length;
                for (let i = 0; i < includedLength; i++) {
                    let item = this.body.included[i];
                    this.includedInObject[item.type + item.id] = item;
                }
            }
        }

        return this.includedInObject;
    }
}

export default JsonDeserializer;