import { applyParamsToScript } from "@meshsdk/core-csl";
import { BrowserWallet, serializePlutusScript } from "@meshsdk/core";
import blueprint from "./plutus.json" with { type: "json" };

// Returns the staking validator
export type Validators = {
    lock: {
        scriptCbor: string;
        scriptAddr: string;
    };
}

export function readValidators(): Validators {
    const stakeValidator = blueprint.validators.find(v => v.title === "stake.stake.spend");

    if (!stakeValidator) {
        throw new Error("Stake validator not found");
    }

    const scriptCbor = applyParamsToScript(stakeValidator.compiledCode, []);

    const scriptAddr = serializePlutusScript(
        { code: scriptCbor, version: "V3" },
        undefined,
        0
    ).address;

    return {
        lock: { scriptCbor, scriptAddr }
    };
}

export async function getWalletForTx(wallet: BrowserWallet) {
    const utxos = await wallet.getUtxos();
    const collateral = (await wallet.getCollateral())[0];
    const walletAddress = await wallet.getChangeAddress();

    if (!utxos || utxos?.length === 0) {
        throw new Error("No utxos found");
    }
    if (!collateral) {
        throw new Error("No collateral found");
    }
    if (!walletAddress) {
        throw new Error("No wallet address found");
    }

    return { utxos, collateral, walletAddress };
}
