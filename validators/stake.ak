use aiken/collection/list
use aiken/interval.{Finite}
use aiken/crypto.{VerificationKeyHash}
use cardano/transaction.{OutputReference, Transaction, ValidityRange}

pub type MyDatum {
    lock_until: POSIXTime,
    owner: VerificationKeyHash,
    beneficiary: VerificationKeyHash,
}

type POSIXTime =
    Int

validator stake {
    spend(datum: Option<MyDatum>, _redeemer: Data, _utxo: OutputReference, self: Transaction) {
        expect Some(MyDatum { lock_until, owner, beneficiary }) = datum

        or {
            must_be_signed_by(self, owner),
            and {
                must_be_signed_by(self, beneficiary),
                must_start_after(self.validity_range, lock_until),
            }
        }
        
    }
}

fn must_be_signed_by(tx: Transaction, signer: VerificationKeyHash) {
    list.has(tx.extra_signatories, signer)
}

fn must_start_after(range: ValidityRange, lock_expiration_time: POSIXTime) {
    when range.lower_bound.bound_type is {
        Finite(time_now) -> lock_expiration_time <= time_now
        _ -> False
    }
}