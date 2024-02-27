/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as DOM from 'vs/base/browser/dom';
import { CancellationToken } from 'vs/base/common/cancellation';
import { MultiDiffEditorWidget } from 'vs/editor/browser/widget/multiDiffEditorWidget/multiDiffEditorWidget';
import { ITextResourceConfigurationService } from 'vs/editor/common/services/textResourceConfiguration';
import { IInstantiationService } from 'vs/platform/instantiation/common/instantiation';
import { InstantiationService } from 'vs/platform/instantiation/common/instantiationService';
import { IStorageService } from 'vs/platform/storage/common/storage';
import { ITelemetryService } from 'vs/platform/telemetry/common/telemetry';
import { IThemeService } from 'vs/platform/theme/common/themeService';
import { AbstractEditorWithViewState } from 'vs/workbench/browser/parts/editor/editorWithViewState';
import { ICompositeControl } from 'vs/workbench/common/composite';
import { IEditorOpenContext } from 'vs/workbench/common/editor';
import { EditorInput } from 'vs/workbench/common/editor/editorInput';
import { IEditorGroupsService } from 'vs/workbench/services/editor/common/editorGroupsService';
import { IEditorService } from 'vs/workbench/services/editor/common/editorService';
import { URI } from 'vs/base/common/uri';
import { MultiDiffEditorViewModel } from 'vs/editor/browser/widget/multiDiffEditorWidget/multiDiffEditorViewModel';
import { IMultiDiffEditorOptions, IMultiDiffEditorViewState } from 'vs/editor/browser/widget/multiDiffEditorWidget/multiDiffEditorWidgetImpl';
import { BulkEditPane, getBulkEditPane2 } from 'vs/workbench/contrib/bulkEdit/browser/preview/bulkEditPane';
import { ResourceEdit } from 'vs/editor/browser/services/bulkEditService';
import { WorkbenchUIElementFactory } from 'vs/workbench/contrib/multiDiffEditor/browser/multiDiffEditor';
import { BulkEditEditorInput } from 'vs/workbench/contrib/bulkEdit/browser/preview/bulkEditEditorInput';

export class BulkEditEditor extends AbstractEditorWithViewState<IMultiDiffEditorViewState> {

	static readonly ID = 'bulkEditEditor';

	private _multiDiffEditorWidget: MultiDiffEditorWidget | undefined = undefined;
	private _viewModel: MultiDiffEditorViewModel | undefined;

	private _refactorViewPane: BulkEditPane | undefined;
	private _refactorViewContainer: HTMLElement | undefined;

	private _edits: ResourceEdit[] = [];
	private _promiseResolvedEdits: Promise<ResourceEdit[] | undefined> | undefined;

	public get viewModel(): MultiDiffEditorViewModel | undefined {
		return this._viewModel;
	}

	constructor(
		@IInstantiationService instantiationService: InstantiationService,
		@ITelemetryService telemetryService: ITelemetryService,
		@IThemeService themeService: IThemeService,
		@IStorageService storageService: IStorageService,
		@IEditorService editorService: IEditorService,
		@IEditorGroupsService editorGroupService: IEditorGroupsService,
		@ITextResourceConfigurationService textResourceConfigurationService: ITextResourceConfigurationService,
	) {
		super(
			BulkEditEditor.ID,
			'bulkEditEditor',
			telemetryService,
			instantiationService,
			storageService,
			textResourceConfigurationService,
			themeService,
			editorService,
			editorGroupService
		);
	}

	protected async createEditor(parent: HTMLElement): Promise<void> {
		// console.log('createEditor of BulkEditEditor');
		this._refactorViewContainer = document.createElement('div');
		this._refactorViewContainer.classList.add('bulk-edit-panel', 'show-file-icons');
		const multiDiffEditorHTMLNode = document.createElement('div');
		multiDiffEditorHTMLNode.classList.add('bulk-edit-editor-diff');

		parent.appendChild(this._refactorViewContainer);
		parent.appendChild(multiDiffEditorHTMLNode);
		this._multiDiffEditorWidget = this._register(this.instantiationService.createInstance(
			MultiDiffEditorWidget,
			multiDiffEditorHTMLNode,
			this.instantiationService.createInstance(WorkbenchUIElementFactory),
		));
		// console.log('this._multiDiffEditorWidget : ', this._multiDiffEditorWidget);
		// console.log('before getBulkEditPane2');
		this._refactorViewPane = await getBulkEditPane2(this.instantiationService, this._edits);
		// console.log('view of getBulkEditPane2: ', this._refactorViewPane);
		this._renderRefactorPreviewPane();
		this._register(this._multiDiffEditorWidget.onDidChangeActiveControl(() => {
			this._onDidChangeControl.fire();
		}));
	}

	private _renderRefactorPreviewPane() {
		if (this._refactorViewPane && this._refactorViewContainer) {
			DOM.clearNode(this._refactorViewContainer);
			this._promiseResolvedEdits = this._refactorViewPane.setInput(this._edits, CancellationToken.None);
			// TODO: Do we neeed to save the input in the refactor view pane?
			// if (this._bulkEditEditorInput) {
			// 	this._refactorViewPane.input = this._bulkEditEditorInput;
			// }
			this._refactorViewPane.renderBody(this._refactorViewContainer);
			this._refactorViewPane.focus();
		}
	}

	override async setInput(input: BulkEditEditorInput, options: IMultiDiffEditorOptions | undefined, context: IEditorOpenContext, token: CancellationToken): Promise<void> {

		// console.log('setInput');
		// console.log('input : ', input);
		// console.log('this._multiDiffEditorWidget : ', this._multiDiffEditorWidget);
		// this._bulkEditEditorInput = input;

		this._edits = input.inputEdits;
		await super.setInput(input, options, context, token);
		this._viewModel = await input.getViewModel();
		// console.log('this._viewModel : ', this._viewModel);
		this._multiDiffEditorWidget!.setViewModel(this._viewModel);

		const viewState = this.loadEditorViewState(input, context);
		// console.log('viewState : ', viewState);
		if (viewState) {
			this._multiDiffEditorWidget!.setViewState(viewState);
		}
		// TODO: Needs to be there so that the rendering is done as expected
		this._renderRefactorPreviewPane();
		this._reveal(options);
		// console.log('end of setInput');
	}

	override async setOptions(options: IMultiDiffEditorOptions | undefined): Promise<void> {
		console.log('setOptions options : ', options);
		this._reveal(options);

		/*
		// TODO: We need to update the multi diff editor when the edits changes
		// TODO: The actual files need to be change in the temporary files for the change to be propagated, how to change the transient files?
		console.log('this._bulkEditEditorInput : ', this._bulkEditEditorInput);
		if (this._bulkEditEditorInput) {
			this._viewModel = await this._bulkEditEditorInput.getViewModel();
			console.log('this._viewModel : ', this._viewModel);
			const items = this._viewModel.items.get();
			const _item = items[0];
			console.log('_item.lastTemplateData.get().selections : ', _item.lastTemplateData.get().selections);
			console.log('this._viewModel.items.get() : ', items);
			console.log('this._viewModel.model : ', this._viewModel.model);
			console.log('this._multiDiffEditorWidget :', this._multiDiffEditorWidget);
			this._multiDiffEditorWidget!.setViewModel(this._viewModel);

		}
		*/
	}

	private _reveal(options: IMultiDiffEditorOptions | undefined): void {
		const viewState = options?.viewState;
		if (!viewState || !viewState.revealData) {
			return;
		}
		this._multiDiffEditorWidget?.reveal(viewState.revealData.resource, viewState.revealData.range);
	}

	public hasInput(): boolean {
		return this._refactorViewPane?.hasInput() ?? false;
	}

	override async clearInput(): Promise<void> {
		await super.clearInput();
		this._multiDiffEditorWidget!.setViewModel(undefined);
		this._refactorViewPane?.dispose();
	}

	layout(dimension: DOM.Dimension): void {
		this._multiDiffEditorWidget!.layout(dimension);
	}

	override getControl(): ICompositeControl | undefined {
		return this._multiDiffEditorWidget!.getActiveControl();
	}

	override focus(): void {
		super.focus();
		this._refactorViewPane?.focus();
	}

	override hasFocus(): boolean {
		// TODO: Also check if this._refactorViewContainer has focus
		return this._multiDiffEditorWidget?.getActiveControl()?.hasTextFocus() || super.hasFocus();
	}

	protected override computeEditorViewState(resource: URI): IMultiDiffEditorViewState | undefined {
		return this._multiDiffEditorWidget!.getViewState();
	}

	protected override tracksEditorViewState(input: EditorInput): boolean {
		return input instanceof BulkEditEditorInput;
	}

	protected override toEditorViewStateResource(input: EditorInput): URI | undefined {
		return (input as BulkEditEditorInput).resource;
	}

	public get promiseResolvedEdits(): Promise<ResourceEdit[] | undefined> | undefined {
		return this._promiseResolvedEdits;
	}
}
