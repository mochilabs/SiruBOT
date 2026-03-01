import { AllFlowsPrecondition } from '@sapphire/framework';

export class NodeAvailable extends AllFlowsPrecondition {
	#message = '💡  현재 사용 가능한 노드가 없어요. 잠시 후 다시 시도해 주세요.';
	#ephemeral = true;

	public override chatInputRun() {
		return this.check();
	}

	public override contextMenuRun() {
		return this.check();
	}

	public override messageRun() {
		return this.check();
	}

	public check() {
		return this.container.audio.nodeManager.nodes.filter((node) => node.connected).size > 0 ? this.ok() : this.createError();
	}

	private createError() {
		return this.error({ message: this.#message, context: { ephemeral: this.#ephemeral } });
	}
}
