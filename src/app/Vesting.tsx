"use client";
import { useState, useEffect, Dispatch, SetStateAction } from "react";
import { Input } from "./layouts/Input";
import { Button } from "./layouts/Button";
import {
    MeshTxBuilder,
    BrowserWallet,
    Asset,
    deserializeAddress,
    deserializeDatum,
    BlockfrostProvider,
    unixTimeToEnclosingSlot,
    ConStr0,
    Integer,
    BuiltinByteString,
    SLOT_CONFIG_NETWORK,
    UTxO
} from '@meshsdk/core';
import { mConStr0, MConStr0 } from "@meshsdk/common";
import { getWalletForTx, readValidators } from "../../utils";

interface VestingType {
    meshTxBuilder: MeshTxBuilder | null;
    userWallet: BrowserWallet | null;
    setUserWallet: Dispatch<SetStateAction<BrowserWallet | null>>;
    blockchainProvider: BlockfrostProvider | undefined;
}

type lockDurationType = {
    time: number;
    title: string;  
}[];

// time in minutes
const lockDurations: lockDurationType = [
    {
        time: 3,
        title: "Test (3 mins)"
    },
    {
        time: 3 * 60,
        title: "3 hours"
    },
    {
        time: 3 * 24 * 60,
        title: "3 days"
    },
    {
        time: 3 * 7 * 24 * 60,
        title: "3 weeks"
    },
    {
        time: 12 * 7 * 24 * 60,
        title: "3 months (12 wks)"
    },
];

type Datum = ConStr0<
    [Integer, BuiltinByteString, BuiltinByteString]
>;

export default function Vesting({ meshTxBuilder, userWallet, setUserWallet, blockchainProvider }: VestingType) {
    const validators = readValidators();

    const [lockAdaAmount, setLockAdaAmount] = useState<string>("");
    const [lockAdaAddresses, setLockAdaAddresses] = useState<string>("");
    const [lockDuration, setLockDuration] = useState<string>("");
    const [utxoLockList, setUtxoLockList] = useState<UTxO[] | undefined>([]);
    const [locking, setLocking] = useState<boolean>(false);
    const [unlocking, setUnlocking] = useState<string | null>(null);
    const [lockTxHash, setLockTxHash] = useState<string | undefined>(undefined);
    const [unlockTxHash, setUnlockTxHash] = useState<string | undefined>(undefined);

    type lockTxDetailsType = {
        txHash: string | undefined;
        datumList: MConStr0<(string | number)[]>[];
    }
    const [lockTxDetails, setLockTxDetails] = useState<lockTxDetailsType>({ txHash: "", datumList: [] });

    const lockDurationOptions = lockDurations.map(duration => (
        <option key={duration.title} id={duration.title} value={duration.time}>{duration.title}</option>
    ));

    const handleLock = async () => {
        setLocking(true);

        try {
            const lockUntil = new Date();
            lockUntil.setMinutes(Number(lockDuration) + lockUntil.getMinutes());

            const { utxos, walletAddress } = await getWalletForTx(userWallet!);
            const { pubKeyHash: ownerPubKeyHash } = deserializeAddress(walletAddress);

            const addressesArray = lockAdaAddresses.split(/[,\s]+/);

            const datumList: MConStr0<(string | number)[]>[] = [];
            for (let i = 0; i < addressesArray.length; i++) {
                const { pubKeyHash: beneficiaryPubKeyHash } = deserializeAddress(addressesArray[i]);
                const datum = mConStr0([
                    lockUntil.getTime(),
                    ownerPubKeyHash,
                    beneficiaryPubKeyHash
                ]);
                datumList.push(datum);
            }

            const lovelace = BigInt(Math.round((Number(lockAdaAmount) / datumList.length)) * 1000000);
            // remove below
            console.log(`String lovelace: ${lovelace}`);
            const assets: Asset[] = [
                {
                    unit: "lovelace",
                    quantity: lovelace.toString()
                }
            ];

            const scriptAddr = validators.lock.scriptAddr;

            const txBuilder = meshTxBuilder;

            for (const datum of datumList) {
                txBuilder?.txOut(scriptAddr, assets)
                    .txOutInlineDatumValue(datum)
            };

            await txBuilder?.changeAddress(walletAddress)
                .selectUtxosFrom(utxos)
                .complete();

            const unsignedTx = txBuilder?.txHex;
            const signedTx = await userWallet?.signTx(unsignedTx!);
            const txHash = await userWallet?.submitTx(signedTx!);

            // remove below
            console.log(`${lockAdaAmount} tADA locked into the contract`);
            blockchainProvider?.onTxConfirmed(txHash!, () => {
                setLockTxDetails(prevState => ({ ...prevState, txHash, datumList }));
                setLockTxHash(txHash);
                setLocking(false);
            });
        } catch (err) {
            setLocking(false);
            console.log(err);
        }
    }

    const upDateLockList = async () => {
        const { walletAddress } = await getWalletForTx(userWallet!);
        const { pubKeyHash } = deserializeAddress(walletAddress);

        const scriptAddr = validators.lock.scriptAddr;
        const scriptUtxos = await blockchainProvider!.fetchAddressUTxOs(scriptAddr);

        const foundUtxos = scriptUtxos?.filter(utxo => {
            try {
                const datum = deserializeDatum<Datum>(utxo.output.plutusData!);
                // remove 2 lines below
                console.log(`Datum txHash: ${utxo.input.txHash}`);
                console.log(`Datum txHash: ${utxo.output.dataHash}`);
                return (datum.fields[1].bytes === pubKeyHash || datum.fields[2].bytes === pubKeyHash);
            } catch {
                return false;
            }
        });

        setUtxoLockList(foundUtxos);
    };

    useEffect(() => {
        upDateLockList();
    }, [locking, lockTxHash, unlocking, unlockTxHash]);

    const handleUnlock = async (txHashForUnlock: string, beneficiary: string) => {
        setUnlocking(txHashForUnlock);

        try {
            const lockTxHashUtxos = await blockchainProvider?.fetchUTxOs(txHashForUnlock);

            const { utxos, walletAddress, collateral } = await getWalletForTx(userWallet!);
            const { input: collateralInput, output: collateralOutput } = collateral;
            const { pubKeyHash } = deserializeAddress(walletAddress);

            const unlockerUtxos = lockTxHashUtxos!.filter(utxo => {
                try {
                    const datum = deserializeDatum<Datum>(utxo.output.plutusData!);
                    return (datum.fields[1].bytes === pubKeyHash || (datum.fields[2].bytes === beneficiary && pubKeyHash === beneficiary));
                } catch {
                    return false;
                }
            });

            const { scriptCbor, scriptAddr } = validators.lock;

            const txBuilder = meshTxBuilder;

            for (let i = 0; i < unlockerUtxos.length; i++) {
                const utxo = unlockerUtxos[i];
                const datum = deserializeDatum<Datum>(utxo.output.plutusData!);

                const invalidBefore = unixTimeToEnclosingSlot(
                    Math.min(datum.fields[0].int as number, Date.now() - 15000),
                    SLOT_CONFIG_NETWORK.preprod
                ) + 1;

                txBuilder?.spendingPlutusScript("V3")
                    .txIn(
                        utxo.input.txHash,
                        utxo.input.outputIndex,
                        utxo.output.amount,
                        scriptAddr
                    )
                    .spendingReferenceTxInInlineDatumPresent()
                    .spendingReferenceTxInRedeemerValue("")
                    .txInScript(scriptCbor)
                    .txOut(walletAddress, [])
                    .txInCollateral(
                        collateralInput.txHash,
                        collateralInput.outputIndex,
                        collateralOutput.amount,
                        collateralOutput.address
                    )
                    .invalidBefore(invalidBefore)
            }

            await txBuilder?.requiredSignerHash(pubKeyHash)
                .changeAddress(walletAddress)
                .selectUtxosFrom(utxos)
                .complete();

            const unsignedTx = txBuilder?.txHex;
            const signedTx = await userWallet?.signTx(unsignedTx!);
            const txHash = await userWallet?.submitTx(signedTx!);

            blockchainProvider?.onTxConfirmed(txHash!, () => {
                setUnlockTxHash(txHash);
                // remove
                console.log(`${lockAdaAmount} tADA unlocked!`);
                setUnlocking(null);
            });
        } catch (err) {
            setUnlocking(null);
            console.log(err);
        }
    };

    return (
        <>
            <h2 className="mt-10 text-lg font-bold">Vest ADA</h2>

            <Input
                type="text"
                name="lockAdaAmount"
                id="lockAdaAmount"
                value={lockAdaAmount}
                onInput={(e: React.FormEvent<HTMLInputElement>) => setLockAdaAmount(e.currentTarget.value)}
            >
                Ada Amount to Vest
            </Input>

            <label
                htmlFor="lockDuration"
                className="block mt-4 mb-3 text-sm font-medium text-gray-700"
            >Vesting Duration</label>
            <select
                id="lockDuration"
                value={lockDuration}
                onChange={e => setLockDuration(e.currentTarget.value)}
                className="bg-gray-50 my-4 block border rounded-md h-8"
            >
                <option value=""></option>
                {lockDurationOptions}
            </select>

            <Input
                type="text"
                name="lockAdaAddresses"
                id="lockAdaAddresses"
                value={lockAdaAddresses}
                onInput={(e: React.FormEvent<HTMLInputElement>) => setLockAdaAddresses(e.currentTarget.value)}
            >
                Addresses to distribute ADA to (comma separated)
            </Input>

            <Button
                className="my-4"
                onClick={handleLock}
                disabled={locking}
            >
                {locking ? "Vesting..." : "Vest"}
            </Button>

            {lockTxDetails.txHash &&
                <div className="mb-8 mt-4 text-center">
                    <p><span className="font-semibold">ADA locked!;</span> Transaction hash: <a
                        target="_blank"
                        className="text-blue-400"
                        href={`https://preprod.cardanoscan.io/transaction/${lockTxDetails.txHash}`}
                    >{lockTxDetails.txHash}</a></p>
                    <p>Datum(s): <br /> {lockTxDetails.datumList.map((datum, key) => (
                        <pre key={key} className="bg-gray-200 p-2 rounded overflow-auto max-w-screen-sm">{JSON.stringify(datum)}</pre>
                    ))}</p>
                </div>
            }

            {!!utxoLockList?.length &&
                (<>
                    <h2 className="mt-4 text-lg font-semibold">List of Locked ADA</h2>
                    {unlockTxHash && 
                        <p>ADA Unlocked!; Transaction hash: <a
                            target="_blank"
                            className="text-blue-400 my-3"
                            href={`https://preprod.cardanoscan.io/transaction/${unlockTxHash}`}
                        >{unlockTxHash}</a></p>
                    }
                    <div className="mt-2">
                        {utxoLockList.map((utxo, key) => {
                            const datum = deserializeDatum<Datum>(utxo.output.plutusData!);

                            let timeLeftMins = (Number(datum.fields[0].int) - new Date().getTime()) / (1000 * 60);
                            timeLeftMins = timeLeftMins >= 0 ? timeLeftMins : 0
                            timeLeftMins = Number(timeLeftMins.toFixed(3));

                            console.log(`key: ${key}`);

                            return (
                                <p key={key} className="flex flex-row gap-6 mt-2 align-middle">
                                    <div>Amount locked: {(Number(utxo.output.amount[0].quantity) / 1000000).toFixed(2)} tADA</div>
                                    <div>Time left: {timeLeftMins} mins</div>
                                    <div>Address's pubKeyHash locked to: {datum.fields[2].bytes}</div>
                                    <div>
                                        <Button
                                            onClick={() => handleUnlock(utxo.input.txHash, datum.fields[2].bytes)}
                                            id={String(key)}
                                            disabled={!!timeLeftMins || unlocking === utxo.input.txHash}
                                        >
                                            {unlocking === utxo.input.txHash ? "Unlocking..." : "Unlock"}
                                        </Button>
                                    </div>
                                </p>
                        )})}
                    </div>
                </>)
            }
        </>
    );
}
